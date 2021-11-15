import {
  ClaimGateway,
  CollectiveClaimGateway,
  CoverGateway,
  DaiToken,
  Encode,
  InfiToken,
  ListingGateway,
  Pool,
  UChildDAI,
  UChildINFI,
} from '@project/contracts/typechain';
import { BigNumber, BigNumberish, Contract, Signer } from 'ethers';
import { deployments, ethers, network } from 'hardhat';

import {
  calculateDayInUnix,
  calculateListingFee,
  getNowUnix,
} from '../../test/unit/utils/calculationUtils';
import {
  CURRENCY_TYPE,
  INSURED_RULE,
  PAY_TYPE,
} from '../../test/unit/utils/constants';
import {
  CoinPricingInfoUnsigned,
  CoverRequest,
  CreateCoverRequestData,
  DAIPermit,
  ProvideCover,
  SignerWithAddress,
} from '../../test/unit/utils/interfaces';
import { encodeParam, encodePermit } from '../../test/unit/utils/paramUtils';
import {
  signCoinPricingInfo,
  signPermitDai,
} from '../../test/unit/utils/signTypedDataUtils';

// Template
export const coverRequestData: CoverRequest = {
  coverQty: 100,
  coverMonths: 3,
  insuredSum: ethers.utils.parseUnits('1729'),
  insuredSumTarget: ethers.utils.parseUnits('1729'),
  insuredSumCurrency: CURRENCY_TYPE.DAI,
  premiumSum: ethers.utils.parseUnits('249.9999979'),
  premiumCurrency: CURRENCY_TYPE.USDT,
  expiredAt: getNowUnix() + calculateDayInUnix(11),
  coinId: 'dai',
  coverLimit: {
    coverType: 0,
    territoryIds: [0, 1],
  },
  insuredSumRule: INSURED_RULE.FULL, // full
  holder: '',
};

export const dataCoinDAI: CoinPricingInfoUnsigned = {
  coinId: 'dai',
  coinSymbol: 'DAI',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};

export const dataCoinInfi: CoinPricingInfoUnsigned = {
  coinId: 'insured-finance',
  coinSymbol: 'infi',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('0.054583', 6),
};

/**
 * Interfaces
 */
export interface RequestCoverData {
  insuredSum: BigNumber;
  premiumSum: BigNumber;
  coverMonths: BigNumberish;
  daiToken: DaiToken | UChildDAI;
  holder: SignerWithAddress;
  pool: Pool;
  encode: Encode;
  coinSigner: SignerWithAddress;
  infiToken: InfiToken | UChildINFI;
}

export interface ProvideCoverData {
  requestCoverId: number;
  funder: SignerWithAddress;
  fundingSum: BigNumber;
  daiToken: DaiToken | UChildDAI;
  coinSigner: SignerWithAddress;
  pool: Pool;
  encode: Encode;
  coverGateway: CoverGateway;
}

export async function getContract<T extends Contract>(
  name: string,
  signer?: string | Signer
): Promise<T> {
  const proxy1 =
    (await deployments.getOrNull(`UChildERC20Proxy${name}`)) ||
    (await deployments.getOrNull(`UChildERC20Proxy${name}Dummy`));

  const proxy2 = await deployments.getOrNull(`FiatTokenProxy${name}`);

  if (proxy1) {
    return (await ethers.getContract<T>(`UChild${name}`, signer)).attach(
      proxy1.address
    ) as T;
  } else if (proxy2) {
    return (await ethers.getContract<T>(`FiatToken${name}`, signer)).attach(
      proxy2.address
    ) as T;
  } else {
    return ethers.getContract<T>(name, signer);
  }
}

export async function createRequestCoverWithDAI(
  createRequestCoverData: RequestCoverData
) {
  const listingGateway: ListingGateway = await getContract<ListingGateway>(
    'ListingGateway'
  );

  const {
    insuredSum,
    premiumSum,
    daiToken,
    holder,
    pool,
    encode,
    coinSigner,
    infiToken,
  } = createRequestCoverData;

  const blockNow = (await ethers.provider.getBlock('latest')).timestamp;
  const getNonceDAI = (address: string) =>
    (daiToken as UChildDAI).getNonce
      ? (daiToken as UChildDAI).getNonce(address)
      : (daiToken as DaiToken).nonces(address);
  const daiDecimal = await daiToken.decimals();
  const nonce = await getNonceDAI(holder.address);
  const signPermitDaiData: DAIPermit = await signPermitDai(
    holder,
    pool.address,
    nonce.toNumber(),
    blockNow + calculateDayInUnix(1)
  );
  const permitDataBytes: string = encodePermit(
    CURRENCY_TYPE.DAI,
    signPermitDaiData,
    encode
  );
  const expiredAt = blockNow + calculateDayInUnix(11);

  const coinLatestPrice = await listingGateway.getChainlinkPrice(
    CURRENCY_TYPE.DAI
  );

  // Process
  const data: CreateCoverRequestData = {
    request: {
      ...coverRequestData,
      insuredSum,
      insuredSumTarget: insuredSum.sub(
        ethers.utils.parseUnits('2', daiDecimal)
      ), // tolerance 2 token
      insuredSumCurrency: CURRENCY_TYPE.DAI,
      premiumSum,
      premiumCurrency: CURRENCY_TYPE.DAI,
      holder: holder.address,
      expiredAt,
    },
    roundId: coinLatestPrice.roundId,
    assetPricing: await signCoinPricingInfo(
      dataCoinDAI,
      coinSigner,
      pool.address
    ), // verify by pool
    feePricing: await signCoinPricingInfo(
      dataCoinInfi,
      coinSigner,
      pool.address
    ), // verify by pool
    premiumPermit: permitDataBytes,
  };
  const payloadInBytes = encodeParam(
    PAY_TYPE.CREATE_COVER_REQUEST,
    data,
    encode
  );

  const infiTokenTransfered = calculateListingFee(
    data.request.insuredSum,
    daiDecimal,
    data.feePricing.coinPrice,
    coinLatestPrice.decimals,
    coinLatestPrice.price
  );

  // Trigger function on infi token contract
  await infiToken
    .connect(holder)
    ['transferAndCall(address,uint256,bytes)'](
      pool.address,
      infiTokenTransfered,
      payloadInBytes
    );
}

/**
 * @dev Function for Provide Cover
 * */
export async function provideCoverWithDAI(param: ProvideCoverData) {
  const {
    requestCoverId,
    funder,
    fundingSum,
    daiToken,
    coinSigner,
    pool,
    encode,
    coverGateway,
  } = param;
  // Create permit for DAI
  const blockNow = (await ethers.provider.getBlock('latest')).timestamp;
  const getNonceDAI = (address: string) =>
    (daiToken as UChildDAI).getNonce
      ? (daiToken as UChildDAI).getNonce(address)
      : (daiToken as DaiToken).nonces(address);
  const nonce = await getNonceDAI(funder.address);
  const signPermitDaiData: DAIPermit = await signPermitDai(
    funder,
    pool.address,
    nonce.toNumber(),
    blockNow + calculateDayInUnix(1)
  );
  const permitDataBytes: string = encodePermit(
    CURRENCY_TYPE.DAI,
    signPermitDaiData,
    encode
  );
  // Prepare Data
  const provideCoverData: ProvideCover = {
    requestId: requestCoverId,
    provider: funder.address,
    fundingSum,
    assetPricing: await signCoinPricingInfo(
      dataCoinDAI,
      coinSigner,
      pool.address
    ), // verify by Cover Gateway
    assetPermit: permitDataBytes,
  };

  // Send transaction
  await coverGateway.connect(funder).provideCover(provideCoverData);
}
