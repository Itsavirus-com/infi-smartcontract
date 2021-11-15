import {
  Encode,
  InfiToken,
  ListingGateway,
  Pool,
  UChildDAI,
  UChildUSDC,
  UsdtToken,
} from '@project/contracts/typechain';
import { ethers } from 'hardhat';

import {
  calculateDayInUnix,
  calculateListingFee,
  calculateNextMonthInUnix,
} from './calculationUtils';
import {
  CURRENCY_TYPE,
  dataCoinDai,
  dataCoinUsdc,
  dataCoinUsdt,
  EMPTY_PERMIT_BYTES,
  PAY_TYPE,
} from './constants';
import { getContract } from './deployments';
import {
  CoinPricingInfoUnsigned,
  CreateCoverOfferData,
  DAIPermit,
  EIP2612Permit,
  OfferData,
  SignerWithAddress,
} from './interfaces';
import { encodeParam, encodePermit } from './paramUtils';
import {
  signCoinPricingInfo,
  signPermitDai,
  signPermitUSDC,
} from './signTypedDataUtils';
import { dataCoinInfi } from './template';

/**
 * @dev function for create cover request
 * @param requestData
 * @param funder
 */
export async function createCoverOffer(
  offerData: OfferData,
  funder: SignerWithAddress
): Promise<void> {
  let coinSigner: SignerWithAddress;
  let fundingPermitData: string;

  const encode: Encode = await getContract<Encode>('Encode');
  const usdtToken: UsdtToken = await getContract<UsdtToken>('USDT');
  const usdcToken: UChildUSDC = await getContract<UChildUSDC>('USDC');
  const infiToken: InfiToken = await getContract<InfiToken>('INFI');
  const daiToken: UChildDAI = await getContract<UChildDAI>('DAI');
  const pl: Pool = await getContract<Pool>('Pool');
  const listingGateway: ListingGateway = await getContract<ListingGateway>(
    'ListingGateway'
  );

  const usdtDecimal: number = parseInt(
    (await usdtToken.decimals()).toString(),
    0
  );
  const usdcDecimal: number = await usdcToken.decimals();
  const daiDecimal: number = await daiToken.decimals();
  let dataCoin: CoinPricingInfoUnsigned;

  // eslint-disable-next-line prefer-const
  ({ coinSigner } = await ethers.getNamedSigners());

  // Get Latest price
  const coinLatestPrice = await listingGateway.getChainlinkPrice(
    offerData.insuredSumCurrency
  );

  // set permit data
  if (offerData.premiumCurrency === CURRENCY_TYPE.DAI) {
    const timestampNow = (await ethers.provider.getBlock('latest')).timestamp;
    const nonce = await daiToken.getNonce(funder.address);
    const signPermitDaiData: DAIPermit = await signPermitDai(
      funder,
      pl.address,
      nonce.toNumber(),
      timestampNow + calculateDayInUnix(1)
    );
    fundingPermitData = encodePermit(
      CURRENCY_TYPE.DAI,
      signPermitDaiData,
      encode
    );
    // Set data coin
    dataCoin = { ...dataCoinDai, coinPrice: coinLatestPrice.price };
  } else if (offerData.premiumCurrency === CURRENCY_TYPE.USDC) {
    const nonce = await usdcToken.nonces(funder.address);
    const signPermitDaiData: EIP2612Permit = await signPermitUSDC(
      funder, // owner
      pl.address, // spender
      nonce.toNumber(), // nonce
      ethers.BigNumber.from(offerData.insuredSum), // amount
      calculateNextMonthInUnix(0) + calculateDayInUnix(1) // deadline 1 day expired
    );
    fundingPermitData = encodePermit(
      CURRENCY_TYPE.USDC,
      signPermitDaiData,
      encode
    );
    dataCoin = { ...dataCoinUsdc, coinPrice: coinLatestPrice.price };
  } else {
    fundingPermitData = EMPTY_PERMIT_BYTES;
    dataCoin = { ...dataCoinUsdt, coinPrice: coinLatestPrice.price };
  }

  // prepare data
  const data: CreateCoverOfferData = {
    offer: offerData,
    roundId: coinLatestPrice.roundId,
    feePricing: await signCoinPricingInfo(dataCoinInfi, coinSigner, pl.address), // verify by pool
    assetPricing: await signCoinPricingInfo(dataCoin, coinSigner, pl.address),
    depositPeriod: 1,
    fundingPermit: fundingPermitData,
  };

  // Change payload to bytes
  const payloadInBytes = encodeParam(PAY_TYPE.CREATE_COVER_OFFER, data, encode);

  // calculate infi token for listing fee
  let insuredSumCurrencyDecimal = 0;
  if (data.offer.insuredSumCurrency === CURRENCY_TYPE.DAI) {
    insuredSumCurrencyDecimal = daiDecimal;
  } else if (data.offer.insuredSumCurrency === CURRENCY_TYPE.USDT) {
    insuredSumCurrencyDecimal = usdtDecimal;
  } else if (data.offer.insuredSumCurrency === CURRENCY_TYPE.USDC) {
    insuredSumCurrencyDecimal = usdcDecimal;
  }
  const infiTokenTransfered = calculateListingFee(
    data.offer.insuredSum,
    insuredSumCurrencyDecimal,
    data.feePricing.coinPrice,
    coinLatestPrice.decimals,
    coinLatestPrice.price
  );

  // approve premium
  if (data.offer.premiumCurrency === CURRENCY_TYPE.USDT) {
    await usdtToken.connect(funder).approve(pl.address, data.offer.insuredSum);
  }

  // Trigger function on infi token contract
  await infiToken
    .connect(funder)
    ['transferAndCall(address,uint256,bytes)'](
      pl.address,
      infiTokenTransfered,
      payloadInBytes
    );
}
