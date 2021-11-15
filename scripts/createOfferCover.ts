import {
  Encode,
  InfiToken,
  Pool,
  UsdcToken,
} from '@project/contracts/typechain';
import { Contract, Signer } from 'ethers';
import { deployments, ethers } from 'hardhat';

import {
  calculateDayInUnix,
  calculateListingFee,
  calculateNextMonthInUnix,
} from '../test/unit/utils/calculationUtils';
import {
  CURRENCY_TYPE,
  INSURED_RULE,
  PAY_TYPE,
} from '../test/unit/utils/constants';
import {
  CoinPricingInfoUnsigned,
  CoverOffer,
  CreateCoverOfferData,
  EIP2612Permit,
} from '../test/unit/utils/interfaces';
import { encodeParam, encodePermit } from '../test/unit/utils/paramUtils';
import {
  signCoinPricingInfo,
  signPermitUSDC,
} from '../test/unit/utils/signTypedDataUtils';

// Template
const coverOfferData: CoverOffer = {
  minCoverMonths: 1,
  insuredSum: ethers.utils.parseUnits('5000'),
  insuredSumCurrency: CURRENCY_TYPE.DAI,
  premiumCostPerMonth: ethers.utils.parseUnits('50'),
  premiumCurrency: CURRENCY_TYPE.DAI,
  expiredAt: calculateNextMonthInUnix(1),
  coinId: 'dai',
  coverLimit: {
    coverType: 0,
    territoryIds: [0, 1],
  },
  insuredSumRule: INSURED_RULE.FULL,
  funder: '',
};

const dataCoinInfi: CoinPricingInfoUnsigned = {
  coinId: 'insured-finance',
  coinSymbol: 'infi',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('0.054583', 6),
};

async function getContract<T extends Contract>(
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

async function main() {
  const infiToken = await getContract<InfiToken>('INFI');
  const usdcToken = await getContract<UsdcToken>('USDC');
  const pool = await getContract<Pool>('Pool');
  const encode = await getContract<Encode>('Encode');
  const usdcDecimal = await usdcToken.decimals();
  const { coinSigner, funder1 } = await ethers.getNamedSigners();

  const blockNow = (await ethers.provider.getBlock('latest')).timestamp;
  // Permit Data
  const nonce = await usdcToken.nonces(funder1.address);
  const signPermitDaiData: EIP2612Permit = await signPermitUSDC(
    funder1, // owner
    pool.address, // spender
    nonce.toNumber(), // nonce
    ethers.utils.parseUnits('5000', usdcDecimal), // amount
    blockNow + calculateDayInUnix(1) // deadline 1 day expired
  );
  const permitDataBytes: string = encodePermit(
    CURRENCY_TYPE.USDC,
    signPermitDaiData,
    encode
  );

  // Process
  const data: CreateCoverOfferData = {
    offer: {
      ...coverOfferData,
      funder: funder1.address,
      insuredSum: ethers.utils.parseUnits('5000', usdcDecimal),
      insuredSumCurrency: CURRENCY_TYPE.USDC,
      premiumCostPerMonth: ethers.utils.parseUnits('0.416666', usdcDecimal),
      premiumCurrency: CURRENCY_TYPE.USDC,
    },
    feePricing: await signCoinPricingInfo(
      dataCoinInfi,
      coinSigner,
      pool.address
    ), // verify by pool
    fundingPermit: permitDataBytes,
  };
  const payloadInBytes = encodeParam(PAY_TYPE.CREATE_COVER_OFFER, data, encode);
  const infiTokenTransfered = calculateListingFee(
    data.offer.insuredSum,
    usdcDecimal,
    data.feePricing.coinPrice
  );
  // Approve smart contract to use token and Trigger function on infi token contract
  await infiToken
    .connect(funder1)
    ['transferAndCall(address,uint256,bytes)'](
      pool.address,
      infiTokenTransfered,
      payloadInBytes
    );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
