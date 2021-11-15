import {
  CoverGateway,
  Encode,
  Pool,
  UsdcToken,
} from '@project/contracts/typechain';
import { Contract, Signer } from 'ethers';
import { deployments, ethers } from 'hardhat';

import {
  calculateDayInUnix,
  calculateNextMonthInUnix,
} from '../test/unit/utils/calculationUtils';
import { CURRENCY_TYPE, INSURED_RULE } from '../test/unit/utils/constants';
import {
  BuyCover,
  CoinPricingInfoUnsigned,
  CoverOffer,
  EIP2612Permit,
} from '../test/unit/utils/interfaces';
import { encodePermit } from '../test/unit/utils/paramUtils';
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

const dataCoinUNItoDAI: CoinPricingInfoUnsigned = {
  coinId: 'uni',
  coinSymbol: 'UNI',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('35.78', 6),
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
  const { coinSigner, holder2 } = await ethers.getNamedSigners();
  const pool = await getContract<Pool>('Pool');
  const encode = await getContract<Encode>('Encode');
  const usdcToken = await getContract<UsdcToken>('USDC');
  const cg = await getContract<CoverGateway>('CoverGateway');
  const usdcDecimal = await usdcToken.decimals();
  const currentTime = (
    await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
  ).timestamp;
  // Set insured sum
  const insuredSumInUnit = ethers.utils.parseUnits('5000', usdcDecimal);
  const coverQtyInUnit = insuredSumInUnit
    .mul(ethers.utils.parseUnits('1', 6)) // Need to times to 1e6 because will divider by 1e6
    .div(dataCoinUNItoDAI.coinPrice);

  // Permit Data
  const nonce = await usdcToken.nonces(holder2.address);
  const signPermitData: EIP2612Permit = await signPermitUSDC(
    holder2, // owner
    pool.address, // spender
    nonce.toNumber(), // nonce
    ethers.utils.parseUnits('5000', usdcDecimal),
    currentTime + calculateDayInUnix(1) // deadline 1 day expired
  );
  const permitDataBytes: string = encodePermit(
    CURRENCY_TYPE.USDC,
    signPermitData,
    encode
  );

  // Transaction Data
  const dataBuyCover: BuyCover = {
    offerId: 0, // offer id
    buyer: holder2.address,
    coverMonths: 1,
    coverQty: coverQtyInUnit,
    insuredSum: insuredSumInUnit,
    assetPricing: await signCoinPricingInfo(
      dataCoinUNItoDAI,
      coinSigner,
      pool.address // verify by Cover Gateway Contract
    ),
    premiumPermit: permitDataBytes,
  };

  // Buy Cover Process
  await cg.connect(holder2).buyCover(dataBuyCover);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
