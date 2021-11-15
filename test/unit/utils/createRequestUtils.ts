import {
  ClaimData,
  ClaimGateway,
  CoverData,
  CoverGateway,
  Encode,
  InfiToken,
  ListingData,
  ListingGateway,
  Pool,
  UChildDAI,
  UChildUSDC,
  UsdtToken,
} from '@project/contracts/typechain';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { deployments, ethers, network } from 'hardhat';

import {
  calculateDayInUnix,
  calculateListingFee,
  calculateNextMonthInUnix,
  getNowUnix,
} from './calculationUtils';
import {
  CURRENCY_TYPE,
  EMPTY_PERMIT_BYTES,
  INSURED_RULE,
  PAY_TYPE,
} from './constants';
import { getContract } from './deployments';
import {
  CoinPricingInfoUnsigned,
  CoverRequest,
  CreateCoverRequestData,
  DAIPermit,
  EIP2612Permit,
  RequestData,
  SignerWithAddress,
} from './interfaces';
import { encodeParam, encodePermit } from './paramUtils';
import {
  signCoinPricingInfo,
  signPermitDai,
  signPermitUSDC,
} from './signTypedDataUtils';
import { dataCoinInfi, dataCoinUSDT } from './template';

/**
 * @dev function for create cover request
 * @param requestData
 * @param holder
 */
export async function createCoverRequest(
  requestData: RequestData,
  holder: SignerWithAddress
) {
  let coinSigner: SignerWithAddress;
  let premiumPermitData: string;

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

  // eslint-disable-next-line prefer-const
  ({ coinSigner } = await ethers.getNamedSigners());

  // Get Latest price
  const coinLatestPrice = await listingGateway.getChainlinkPrice(
    requestData.insuredSumCurrency
  );

  // set permit data
  if (requestData.premiumCurrency === CURRENCY_TYPE.DAI) {
    const nonce = await daiToken.getNonce(holder.address);
    const signPermitDaiData: DAIPermit = await signPermitDai(
      holder,
      pl.address,
      nonce.toNumber(),
      getNowUnix() + calculateDayInUnix(1)
    );
    premiumPermitData = encodePermit(
      CURRENCY_TYPE.DAI,
      signPermitDaiData,
      encode
    );
  } else if (requestData.premiumCurrency === CURRENCY_TYPE.USDC) {
    const nonce = await usdcToken.nonces(holder.address);
    const signPermitDaiData: EIP2612Permit = await signPermitUSDC(
      holder, // owner
      pl.address, // spender
      nonce.toNumber(), // nonce
      ethers.BigNumber.from(requestData.premiumSum), // amount
      calculateNextMonthInUnix(0) + calculateDayInUnix(1) // deadline 1 day expired
    );
    premiumPermitData = encodePermit(
      CURRENCY_TYPE.USDC,
      signPermitDaiData,
      encode
    );
  } else {
    premiumPermitData = EMPTY_PERMIT_BYTES;
  }

  // prepare data
  const data: CreateCoverRequestData = {
    request: requestData,
    assetPricing: await signCoinPricingInfo(
      dataCoinUSDT,
      coinSigner,
      pl.address
    ), // verify by pool
    feePricing: await signCoinPricingInfo(dataCoinInfi, coinSigner, pl.address), // verify by pool
    premiumPermit: premiumPermitData,
    roundId: coinLatestPrice.roundId,
  };

  // Change payload to bytes
  const payloadInBytes = encodeParam(
    PAY_TYPE.CREATE_COVER_REQUEST,
    data,
    encode
  );

  // calculate infi token for listing fee
  let insuredSumCurrencyDecimal = 0;
  if (data.request.insuredSumCurrency === CURRENCY_TYPE.DAI) {
    insuredSumCurrencyDecimal = daiDecimal;
  } else if (data.request.insuredSumCurrency === CURRENCY_TYPE.USDT) {
    insuredSumCurrencyDecimal = usdtDecimal;
  } else if (data.request.insuredSumCurrency === CURRENCY_TYPE.USDC) {
    insuredSumCurrencyDecimal = usdcDecimal;
  }
  const infiTokenTransfered = calculateListingFee(
    data.request.insuredSum,
    insuredSumCurrencyDecimal,
    data.feePricing.coinPrice,
    coinLatestPrice.decimals,
    coinLatestPrice.price
  );

  // approve premium
  if (data.request.premiumCurrency === CURRENCY_TYPE.USDT) {
    await usdtToken
      .connect(holder)
      .approve(pl.address, data.request.premiumSum);
  }

  // Trigger function on infi token contract
  await infiToken
    .connect(holder)
    ['transferAndCall(address,uint256,bytes)'](
      pl.address,
      infiTokenTransfered,
      payloadInBytes
    );
}
