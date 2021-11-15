import {
  DaiToken,
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
import { deployments, ethers } from 'hardhat';

import {
  calculateDayInUnix,
  calculateListingFee,
  calculateNextMonthInUnix,
} from '../utils/calculationUtils';
import {
  coverOfferData,
  CURRENCY_TYPE,
  dataCoinDai,
  dataCoinInfi,
  dataCoinUsdc,
  dataCoinUsdt,
  EMPTY_PERMIT_BYTES,
  PAY_TYPE,
} from '../utils/constants';
import { createCoverOffer } from '../utils/createOfferUtils';
import { getContract } from '../utils/deployments';
import {
  CoverOffer,
  CreateCoverOfferData,
  DAIPermit,
  EIP2612Permit,
  SignerWithAddress,
} from '../utils/interfaces';
import { encodeParam, encodePermit } from '../utils/paramUtils';
import {
  signCoinPricingInfo,
  signPermitDai,
  signPermitUSDC,
} from '../utils/signTypedDataUtils';

const { expect } = chai;

describe('Create Offer Cover', () => {
  // Defined variable
  let funder1: SignerWithAddress;
  let funder2: SignerWithAddress;
  let devWallet: SignerWithAddress;
  let coinSigner: SignerWithAddress;

  let encode: Encode;
  let ld: ListingData;
  let pl: Pool;
  let infiToken: InfiToken;
  let daiToken: DaiToken | UChildDAI;
  let usdtToken: UsdtToken;
  let usdcToken: UChildUSDC;
  let listingGateway: ListingGateway;
  let usdcDecimal: number;
  let usdtDecimal: number;
  let daiDecimal: number;

  const getNonceDAI = (address: string) =>
    (daiToken as UChildDAI).getNonce
      ? (daiToken as UChildDAI).getNonce(address)
      : (daiToken as DaiToken).nonces(address);

  before(async () => {
    await deployments.fixture(['Config', 'Encode', 'MockBalances'], {
      keepExistingDeployments: true,
    });

    ({
      devWallet,
      funder1,
      funder2,
      coinSigner,
    } = await ethers.getNamedSigners());

    // Get external contracts
    infiToken = await getContract<InfiToken>('INFI');
    daiToken = await getContract<DaiToken | UChildDAI>('DAI');
    usdcToken = await getContract<UChildUSDC>('USDC');
    usdtToken = await getContract<UsdtToken>('USDT');

    // Get fresh contract
    listingGateway = await getContract<ListingGateway>('ListingGateway');
    encode = await getContract<Encode>('Encode');
    ld = await getContract<ListingData>('ListingData');
    pl = await getContract<Pool>('Pool');

    usdcDecimal = await usdcToken.decimals();
    usdtDecimal = parseInt((await usdtToken.decimals()).toString(), 0);
    daiDecimal = await daiToken.decimals();
  });

  it('Test keccak', async () => {
    console.log(
      'CREATE COVER REQUEST : ',
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes('CREATE_COVER_REQUEST'))
    );
    console.log(
      'CREATE COVER OFFER : ',
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes('CREATE_COVER_OFFER'))
    );
  });

  it('Create Offer Cover - DAI', async () => {
    // Pre-process
    const memberTokenBefore = await infiToken.balanceOf(funder1.address);
    const poolTokenBefore = await infiToken.balanceOf(pl.address);
    const devTokenBefore = await infiToken.balanceOf(devWallet.address);
    const offerCoverId = 0;

    // Process
    const offerData: CoverOffer = {
      ...coverOfferData,
      funder: funder1.address,
      premiumCurrency: CURRENCY_TYPE.DAI,
    };

    // Get Latest price
    const coinLatestPrice = await listingGateway.getChainlinkPrice(
      offerData.insuredSumCurrency
    );

    const feePricing = await signCoinPricingInfo(
      dataCoinInfi,
      coinSigner,
      pl.address
    );

    const infiTokenTransfered = calculateListingFee(
      offerData.insuredSum,
      daiDecimal,
      feePricing.coinPrice,
      coinLatestPrice.decimals,
      coinLatestPrice.price
    );

    let devFee;
    if (infiTokenTransfered.mod(2).eq(1)) {
      devFee = infiTokenTransfered.div(2).add(1);
    } else {
      devFee = infiTokenTransfered.div(2);
    }

    await createCoverOffer(offerData, funder1);

    // Expect Data
    const memberTokenAfter = await infiToken.balanceOf(funder1.address);
    const poolTokenAfter = await infiToken.balanceOf(pl.address);
    const storedData = await ld.getCoverOfferById(offerCoverId);
    expect(storedData.insuredSum).to.eq(offerData.insuredSum);
    expect(storedData.coinId).to.eq(offerData.coinId);
    // expect(storedData.expiredAt).to.eq(data.offer.expiredAt);
    expect(storedData.insuredSumCurrency).to.eq(offerData.insuredSumCurrency);
    expect(storedData.coverLimit.coverType).to.eq(
      offerData.coverLimit.coverType
    );
    expect(storedData.coverLimit.territoryIds).to.have.lengthOf(
      offerData.coverLimit.territoryIds.length
    );
    expect(memberTokenAfter).to.eq(memberTokenBefore.sub(infiTokenTransfered));
    expect(poolTokenAfter).to.eq(poolTokenBefore);
    expect(await infiToken.balanceOf(devWallet.address)).to.eq(
      devTokenBefore.add(devFee)
    );
  });

  it('Create Offer Cover - USDC', async () => {
    // Pre-process
    const memberTokenBefore = await infiToken.balanceOf(funder1.address);
    const poolTokenBefore = await infiToken.balanceOf(pl.address);
    const devTokenBefore = await infiToken.balanceOf(devWallet.address);
    const poolUSDCTokenBefore = await usdcToken.balanceOf(pl.address);
    const offerCoverId = 1;

    // Process
    const offerData: CoverOffer = {
      ...coverOfferData,
      funder: funder1.address,
      insuredSum: ethers.utils.parseUnits('5000', usdcDecimal),
      insuredSumCurrency: CURRENCY_TYPE.USDC,
      premiumCostPerMonth: ethers.utils.parseUnits('0.416666', usdcDecimal),
      premiumCurrency: CURRENCY_TYPE.USDC,
    };

    const coinLatestPrice = await listingGateway.getChainlinkPrice(
      offerData.insuredSumCurrency
    );
    const feePricing = await signCoinPricingInfo(
      dataCoinInfi,
      coinSigner,
      pl.address
    );

    const infiTokenTransfered = calculateListingFee(
      offerData.insuredSum,
      usdcDecimal,
      feePricing.coinPrice,
      coinLatestPrice.decimals,
      coinLatestPrice.price
    );

    let devFee;
    if (infiTokenTransfered.mod(2).eq(1)) {
      devFee = infiTokenTransfered.div(2).add(1);
    } else {
      devFee = infiTokenTransfered.div(2);
    }

    await createCoverOffer(offerData, funder1);
    // Expect Data
    const memberTokenAfter = await infiToken.balanceOf(funder1.address);
    const poolTokenAfter = await infiToken.balanceOf(pl.address);
    const poolUSDCTokenAfter = await usdcToken.balanceOf(pl.address);
    const storedData = await ld.getCoverOfferById(offerCoverId);
    expect(storedData.insuredSum).to.eq(offerData.insuredSum);
    expect(storedData.coinId).to.eq(offerData.coinId);
    // expect(storedData.expiredAt).to.eq(data.offer.expiredAt);
    expect(storedData.insuredSumCurrency).to.eq(offerData.insuredSumCurrency);
    expect(storedData.coverLimit.coverType).to.eq(
      offerData.coverLimit.coverType
    );
    expect(storedData.coverLimit.territoryIds).to.have.lengthOf(
      offerData.coverLimit.territoryIds.length
    );
    expect(memberTokenAfter).to.eq(memberTokenBefore.sub(infiTokenTransfered));
    expect(poolTokenAfter).to.eq(poolTokenBefore);
    expect(await infiToken.balanceOf(devWallet.address)).to.eq(
      devTokenBefore.add(devFee)
    );
    expect(poolUSDCTokenAfter).to.eq(
      poolUSDCTokenBefore.add(offerData.insuredSum)
    );
  });

  it('Create Offer Cover - USDT', async () => {
    // Pre-process
    const memberTokenBefore = await infiToken.balanceOf(funder1.address);
    const poolTokenBefore = await infiToken.balanceOf(pl.address);
    const devTokenBefore = await infiToken.balanceOf(devWallet.address);
    const poolUSDTTokenBefore = await usdtToken.balanceOf(pl.address);
    const offerCoverId = 2;

    // Process
    const offerData: CoverOffer = {
      ...coverOfferData,
      funder: funder1.address,
      insuredSum: ethers.utils.parseUnits('5000', usdtDecimal),
      insuredSumCurrency: CURRENCY_TYPE.USDT,
      premiumCostPerMonth: ethers.utils.parseUnits('0.416666', usdtDecimal),
      premiumCurrency: CURRENCY_TYPE.USDT,
    };

    const coinLatestPrice = await listingGateway.getChainlinkPrice(
      offerData.insuredSumCurrency
    );

    const feePricing = await signCoinPricingInfo(
      dataCoinInfi,
      coinSigner,
      pl.address
    );

    const infiTokenTransfered = calculateListingFee(
      offerData.insuredSum,
      usdcDecimal,
      feePricing.coinPrice,
      coinLatestPrice.decimals,
      coinLatestPrice.price
    );

    let devFee;
    if (infiTokenTransfered.mod(2).eq(1)) {
      devFee = infiTokenTransfered.div(2).add(1);
    } else {
      devFee = infiTokenTransfered.div(2);
    }

    await createCoverOffer(offerData, funder1);

    // Expect Data
    const memberTokenAfter = await infiToken.balanceOf(funder1.address);
    const poolTokenAfter = await infiToken.balanceOf(pl.address);
    const poolUSDTTokenAfter = await usdtToken.balanceOf(pl.address);
    const storedData = await ld.getCoverOfferById(offerCoverId);
    expect(storedData.insuredSum).to.eq(offerData.insuredSum);
    expect(storedData.coinId).to.eq(offerData.coinId);
    // expect(storedData.expiredAt).to.eq(data.offer.expiredAt);
    expect(storedData.insuredSumCurrency).to.eq(offerData.insuredSumCurrency);
    expect(storedData.coverLimit.coverType).to.eq(
      offerData.coverLimit.coverType
    );
    expect(storedData.coverLimit.territoryIds).to.have.lengthOf(
      offerData.coverLimit.territoryIds.length
    );
    expect(memberTokenAfter).to.eq(memberTokenBefore.sub(infiTokenTransfered));
    expect(poolTokenAfter).to.eq(poolTokenBefore);
    expect(await infiToken.balanceOf(devWallet.address)).to.eq(
      devTokenBefore.add(devFee)
    );
    expect(poolUSDTTokenAfter).to.eq(
      poolUSDTTokenBefore.add(offerData.insuredSum)
    );
  });

  it('Create Offer Cover - Insufficient Infi Token', async () => {
    // Permit Data
    const nonce = await getNonceDAI(funder2.address);
    const signPermitDaiData: DAIPermit = await signPermitDai(
      funder2,
      pl.address,
      nonce.toNumber(),
      calculateNextMonthInUnix(0)
    );
    const permitDataBytes: string = encodePermit(
      CURRENCY_TYPE.DAI,
      signPermitDaiData,
      encode
    );

    // Process

    // Get Latest price
    const coinLatestPrice = await listingGateway.getChainlinkPrice(
      coverOfferData.insuredSumCurrency
    );

    const data: CreateCoverOfferData = {
      offer: { ...coverOfferData, funder: funder2.address },
      feePricing: await signCoinPricingInfo(
        dataCoinInfi,
        coinSigner,
        pl.address
      ), // verify by pool
      assetPricing: await signCoinPricingInfo(
        dataCoinDai,
        coinSigner,
        pl.address
      ), // verify by pool
      depositPeriod: 1,
      fundingPermit: permitDataBytes,
      roundId: coinLatestPrice.roundId,
    };
    const payloadInBytes = encodeParam(
      PAY_TYPE.CREATE_COVER_OFFER,
      data,
      encode
    );

    const infiTokenTransfered = calculateListingFee(
      data.offer.insuredSum,
      daiDecimal,
      data.feePricing.coinPrice,
      coinLatestPrice.decimals,
      coinLatestPrice.price
    );

    // Approve smart contract to use token and Trigger function on infi token contract
    await daiToken.connect(funder2).approve(pl.address, data.offer.insuredSum);
    expect(
      infiToken
        .connect(funder2)
        ['transferAndCall(address,uint256,bytes)'](
          pl.address,
          infiTokenTransfered,
          payloadInBytes
        )
    ).to.be.revertedWith('ERR_AUTH_4');
  });
});
