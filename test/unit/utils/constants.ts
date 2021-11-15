import { ethers } from 'hardhat';

import {
  calculateDayInUnix,
  calculateNextMonthInUnix,
  getNowUnix,
} from './calculationUtils';
import {
  CoinPricingInfoUnsigned,
  CoverOffer,
  CoverRequest,
} from './interfaces';

export const ASSET_TYPE = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  BNB: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEBNB',
  DAI: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEDAI',
  USDT: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeUSDT',
  DOGE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeDOGE',
  CAKE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeCAKE',
  SUSHI: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeSUSHI',
  MATIC: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeMATIC',
} as const;

export const COVER_TYPE = {
  SMART_PROTOCOL_FAILURE: 0,
  STABLECOIN_DEVALUATION: 1,
  CUSTODIAN_FAILURE: 2,
  RUGPULL_LIQUIDITY_SCAM: 3,
} as const;

export const PLATFORM = {
  PLATFORM_1: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  PLATFORM_2: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEBNB',
} as const;

export const PREMIUM_PAYMENT_TYPE = {
  ETH: 0,
  BNB: 1,
  UNI: 2,
  DAI: 3,
  USDT: 4,
  DOGE: 5,
  CAKE: 6,
  SUSHI: 7,
  MATIC: 8,
} as const;

export const PROJECT_TYPE = {
  ETH: 0,
  BNB: 1,
  UNI: 2,
  DAI: 3,
  USDT: 4,
  DOGE: 5,
  CAKE: 6,
  SUSHI: 7,
  MATIC: 8,
} as const;

export const PROJECT_ADDRESS = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  BNB: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
  UNI: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DOGE: '0xba2ae424d960c26247dd6c32edc70b295c744c43',
  CAKE: '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
  SUSHI: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2',
  MATIC: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
} as const;

export const CURRENCY_TYPE = {
  USDT: 0,
  USDC: 1,
  DAI: 2,
} as const;

export const PLATFORM_TYPE = {
  ETHEREUM: 0,
  MATIC: 1,
} as const;

export const PAY_TYPE = {
  CREATE_COVER_REQUEST: ethers.utils.id('CREATE_COVER_REQUEST'),
  CREATE_COVER_OFFER: ethers.utils.id('CREATE_COVER_OFFER'),
} as const;

export const INSURED_RULE = {
  PARTIAL: 0,
  FULL: 1,
} as const;

export const LISTING_TYPE = {
  REQUEST: 0,
  OFFER: 1,
} as const;

export const EMPTY_PERMIT = {
  owner: '0x0000000000000000000000000000000000000000',
  spender: '0x0000000000000000000000000000000000000000',
  value: ethers.BigNumber.from('0'),
  deadline: 0,
  sigV: 28,
  sigR: '0x0000000000000000000000000000000000000000000000000000000000000000',
  sigS: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

export const EMPTY_PERMIT_BYTES =
  '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export const dataCoinInfi: CoinPricingInfoUnsigned = {
  coinId: 'insured-finance',
  coinSymbol: 'infi',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('0.054583', 6),
};

export const dataCoinUsdt: CoinPricingInfoUnsigned = {
  coinId: 'tether',
  coinSymbol: 'usdt',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};

export const dataCoinUsdc: CoinPricingInfoUnsigned = {
  coinId: 'usd-coin',
  coinSymbol: 'usdc',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};

export const dataCoinDai: CoinPricingInfoUnsigned = {
  coinId: 'dai',
  coinSymbol: 'dai',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 18),
};

// Template
export const coverOfferData: CoverOffer = {
  minCoverMonths: 1,
  insuredSum: ethers.utils.parseUnits('5000'),
  insuredSumCurrency: CURRENCY_TYPE.DAI,
  premiumCostPerMonth: ethers.utils.parseUnits('0.416666666666666666'),
  premiumCurrency: CURRENCY_TYPE.USDT,
  expiredAt: calculateNextMonthInUnix(1),
  coinId: 'dai',
  coverLimit: {
    coverType: 0,
    territoryIds: [0, 1],
  },
  insuredSumRule: 1,
  funder: '',
};

export const coverRequestData: CoverRequest = {
  coverQty: 100,
  coverMonths: 3,
  insuredSum: ethers.utils.parseUnits('1729'),
  insuredSumTarget: ethers.utils.parseUnits('1729'),
  insuredSumCurrency: CURRENCY_TYPE.DAI,
  premiumSum: ethers.utils.parseUnits('249.9999979'),
  premiumCurrency: CURRENCY_TYPE.USDT,
  expiredAt: getNowUnix() + calculateDayInUnix(10),
  coinId: 'dai',
  coverLimit: {
    coverType: 0,
    territoryIds: [0, 1],
  },
  insuredSumRule: INSURED_RULE.FULL, // full
  holder: '',
};

export const dataCoinUNItoDAI: CoinPricingInfoUnsigned = {
  coinId: 'uni',
  coinSymbol: 'UNI',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('35.78', 6),
};

export const dataCoinUSDTtoDAI: CoinPricingInfoUnsigned = {
  coinId: 'dai',
  coinSymbol: 'DAI',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};

export const dataCoinDAItoDAI: CoinPricingInfoUnsigned = {
  coinId: 'dai',
  coinSymbol: 'DAI',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};

export const dataCoinUSDCtoUSDT: CoinPricingInfoUnsigned = {
  coinId: 'usdt',
  coinSymbol: 'USDT',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};

export const dataCoinUSDTtoUSDC: CoinPricingInfoUnsigned = {
  coinId: 'usdt',
  coinSymbol: 'USDT',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};
