import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';

export function calculateListingFee(
  insuredSum: BigNumberish,
  insuredSumCurrencyDecimal: number,
  feePrice: BigNumberish,
  insuredSumCurrencyDecimalOnCL: BigNumberish,
  insuredSumCurrencyPriceOnCL: BigNumberish
): BigNumber {
  const feeCoinPriceDecimal = 6;
  const infiTokenDecimal = 18;
  // uint insuredSumInUSD = insuredSum * insuredSumCurrencyPriceOnCL / 10**insuredSumCurrencyDecimalOnCL / 10**insuredSumCurrencyDecimal; // insuredSum in USD
  // uint insuredSumInInfi = insuredSumInUSD * 10**feeCoinPriceDecimal / feeCoinPrice;
  // uint listingFeeInInfi = insuredSumInInfi / 100;  // 1% of insured sum
  // 100_000_000 * 10_000 * 1_000_000 * 10**18 / 100_000 / 100 / 10_000 / 1_000_000

  return BigNumber.from(insuredSum.toString())
    .mul(BigNumber.from(insuredSumCurrencyPriceOnCL)) // insured sum rate to USD
    .mul(BigNumber.from(10 ** feeCoinPriceDecimal)) // neutralize division by feePrice
    .mul(ethers.utils.parseUnits('1', infiTokenDecimal)) // make the result to be formaed in INFI token decimals
    .div(BigNumber.from(feePrice.toString())) // divide by price of infi
    .div(BigNumber.from(100)) // listing fee is 1%
    .div(BigNumber.from(10).pow(insuredSumCurrencyDecimalOnCL)) // neutralize multiplication by insuredSumCurrencyPriceOnCL
    .div(ethers.utils.parseUnits('1', insuredSumCurrencyDecimal)); // neutralize insured sum decimals
}

export function calculatePremium(
  coverQty: BigNumberish,
  premiumCostPerMonth: BigNumberish,
  coverMonths: BigNumberish
): BigNumberish {
  const coverQtyDecimal = 18;

  const totalPremium = ethers.BigNumber.from(coverQty)
    .mul(premiumCostPerMonth) // Premium Cost Per Month 1 USDT : 0.01 USDC
    .mul(coverMonths) // cover months
    .div(ethers.utils.parseUnits('1', coverQtyDecimal));
  return totalPremium;
}

export function calculateNextMonthInUnix(months: number): number {
  const date = new Date();
  date.setMonth(date.getMonth() + +months);
  return Math.floor(date.getTime() / 1000);
}

export function calculateDayInUnix(day: number): number {
  const dayInUnix = 60 * 60 * 24;
  return dayInUnix * day;
}

export function getNowUnix(): number {
  const date = new Date();
  return Math.floor(date.getTime() / 1000);
}
