import { ethers } from 'hardhat';

import {
  calculateDayInUnix,
  calculateNextMonthInUnix,
  getNowUnix,
} from './calculationUtils';
import { CURRENCY_TYPE, INSURED_RULE } from './constants';
import {
  CoinPricingInfoUnsigned,
  CoverOffer,
  CoverRequest,
} from './interfaces';

// Template
export const dataCoinInfi: CoinPricingInfoUnsigned = {
  coinId: 'insured-finance',
  coinSymbol: 'infi',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('0.054583', 6),
};

export const dataCoinUSDT: CoinPricingInfoUnsigned = {
  coinId: 'tether',
  coinSymbol: 'usdt',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};

export const dataCoinUNItoDAI: CoinPricingInfoUnsigned = {
  coinId: 'uni',
  coinSymbol: 'UNI',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('35.78', 6),
};

export const dataCoinDAItoUSDT: CoinPricingInfoUnsigned = {
  coinId: 'dai',
  coinSymbol: 'DAI',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};

export const coverRequestData: CoverRequest = {
  coverQty: 100,
  coverMonths: 3,
  insuredSum: ethers.utils.parseUnits('1729'),
  insuredSumTarget: ethers.utils.parseUnits('1729'),
  insuredSumCurrency: CURRENCY_TYPE.USDT,
  premiumSum: ethers.utils.parseUnits('249.9999979'),
  premiumCurrency: CURRENCY_TYPE.USDT,
  expiredAt: getNowUnix() + calculateDayInUnix(10),
  coinId: 'dai',
  coverLimit: {
    coverType: 0,
    territoryIds: [0, 1],
  },
  insuredSumRule: INSURED_RULE.FULL,
  holder: '',
};

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

export const dataCoinUNItoUSDT: CoinPricingInfoUnsigned = {
  coinId: 'uni',
  coinSymbol: 'UNI',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('35.78', 6),
};
