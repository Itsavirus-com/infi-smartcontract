import {
  ClaimData,
  ClaimGateway,
  CoverData,
  CoverGateway,
  DaiToken,
  Encode,
  InfiToken,
  Pool,
  UChildDAI,
} from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';

import {
  calculateDayInUnix,
  calculatePremium,
  getNowUnix,
} from '../utils/calculationUtils';
import {
  coverOfferData,
  CURRENCY_TYPE,
  dataCoinDAItoDAI,
  INSURED_RULE,
} from '../utils/constants';
import { createCoverOffer } from '../utils/createOfferUtils';
import { getContract } from '../utils/deployments';
import {
  BuyCover,
  CoverOffer,
  DAIPermit,
  SignerWithAddress,
} from '../utils/interfaces';
import { setUpMockKeepers } from '../utils/keepersUtils';
import { encodeParam, encodePermit } from '../utils/paramUtils';
import {
  signCoinPricingInfo,
  signPermitDai,
} from '../utils/signTypedDataUtils';

const { expect } = chai;
const coverOfferId1 = 0;
const coverOfferId2 = 1;

describe('Take Offer', () => {
  let coinSigner: SignerWithAddress;
  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let funder1: SignerWithAddress;
  let devWallet: SignerWithAddress;
  let infiToken: InfiToken;
  let daiToken: DaiToken | UChildDAI;
  let encode: Encode;
  let pl: Pool;
  let cd: CoverData;
  let cg: CoverGateway;
  let claimData: ClaimData;
  let claimGateway: ClaimGateway;
  let daiDecimal: number;
  const dummyRoundId = '18446744073709555607';

  const getNonceDAI = (address: string) =>
    (daiToken as UChildDAI).getNonce
      ? (daiToken as UChildDAI).getNonce(address)
      : (daiToken as DaiToken).nonces(address);

  before(async () => {
    await deployments.fixture(['Config', 'Encode', 'MockBalances'], {
      keepExistingDeployments: true,
    });

    ({
      holder1,
      holder2,
      funder1,
      coinSigner,
      devWallet,
    } = await ethers.getNamedSigners());

    // Get external contracts
    infiToken = await getContract<InfiToken>('INFI');
    daiToken = await getContract<DaiToken | UChildDAI>('DAI');

    // Deploy and Set Up Contract
    encode = await getContract<Encode>('Encode');
    pl = await getContract<Pool>('Pool');
    cd = await getContract<CoverData>('CoverData');
    cg = await getContract<CoverGateway>('CoverGateway');
    claimData = await getContract<ClaimData>('ClaimData');
    claimGateway = await getContract<ClaimGateway>('ClaimGateway');

    daiDecimal = await daiToken.decimals();
  });

  /**
   * Create Offer
   * Full Uptake
   * scenario :
   * 1. funder create offer
   * 2. holder 1 try to buy cover partially, reverted.
   * 3. holder 1 buy full cover , success
   * 4. holder 2 buy full cover, reverted because no insured sum left.
   * 5. Claim Cover - Succeed
   * 6. Claim Cover Reverted - Claim already done
   */
  it('Create Offer Cover 1 - Full Uptake - DAI', async () => {
    const offerData: CoverOffer = {
      ...coverOfferData,
      funder: funder1.address,
      premiumCurrency: CURRENCY_TYPE.DAI,
    };
    await createCoverOffer(offerData, funder1);
  });

  it('Take Offer 1 - Reverted, must take full insured sum', async () => {
    const insuredSumDecimal = daiDecimal;
    const coverQtyDecimal = 18;

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('1000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinDAItoDAI.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    // Permit Data
    const nonce = await getNonceDAI(holder1.address);
    const signPermitDaiData: DAIPermit = await signPermitDai(
      holder1,
      pl.address,
      nonce.toNumber(),
      getNowUnix() + calculateDayInUnix(1)
    );
    const permitDataBytes: string = encodePermit(
      CURRENCY_TYPE.DAI,
      signPermitDaiData,
      encode
    );

    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: coverOfferId1,
      buyer: holder1.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinDAItoDAI,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: permitDataBytes,
    };

    // Calculate total premium
    const totalPremium = calculatePremium(
      dataBuyCover.coverQty,
      coverOfferData.premiumCostPerMonth,
      dataBuyCover.coverMonths
    );

    // Buy Cover Process
    await daiToken.connect(holder1).approve(pl.address, totalPremium);

    await expect(cg.connect(holder1).buyCover(dataBuyCover)).to.be.revertedWith(
      'ERR_CG_6'
    );
  });

  it('Take Offer 1 - Full Uptake', async () => {
    const insuredSumDecimal = daiDecimal;
    const coverQtyDecimal = 18;

    // Get Token Balance
    const devWalletBefore = await daiToken.balanceOf(devWallet.address);
    const funderWalletBefore = await daiToken.balanceOf(funder1.address);

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('5000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinDAItoDAI.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    console.log(
      'DAI holder 1 balance : ',
      (await daiToken.balanceOf(holder1.address)).toString()
    );
    console.log(
      'INFI holder 1 balance : ',
      (await infiToken.balanceOf(holder1.address)).toString()
    );

    // Permit Data
    const nonce = await getNonceDAI(holder1.address);
    const signPermitDaiData: DAIPermit = await signPermitDai(
      holder1,
      pl.address,
      nonce.toNumber(),
      getNowUnix() + calculateDayInUnix(1)
    );
    const permitDataBytes: string = encodePermit(
      CURRENCY_TYPE.DAI,
      signPermitDaiData,
      encode
    );

    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: coverOfferId1,
      buyer: holder1.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinDAItoDAI,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: permitDataBytes,
    };

    // Calculate total premium
    const totalPremium = calculatePremium(
      dataBuyCover.coverQty,
      coverOfferData.premiumCostPerMonth,
      dataBuyCover.coverMonths
    );

    console.log('Premium Needed : ', totalPremium.toString());

    // Buy Cover Process
    await cg.connect(holder1).buyCover(dataBuyCover);

    const coverId = 0;
    const coverData = await cd.getCoverById(coverId);

    expect(coverData.offerId).to.eq(dataBuyCover.offerId);
    expect(coverData.requestId).to.eq(0);
    expect(coverData.holder).to.eq(dataBuyCover.buyer);
    expect(coverData.insuredSum).to.eq(dataBuyCover.insuredSum);
    expect(coverData.coverQty).to.eq(dataBuyCover.coverQty);

    // Check getEndAt function
    const monthInUnix = calculateDayInUnix(30);
    const coverMonthsInUnix = ethers.BigNumber.from(
      dataBuyCover.coverMonths
    ).mul(monthInUnix);
    const coverStartAt = await cd.insuranceCoverStartAt(coverId);
    const endAtActual = coverStartAt.add(coverMonthsInUnix);
    const endAtByFunction = await cg.getEndAt(coverId);
    expect(endAtActual).to.eq(endAtByFunction);

    // Get Token Balance
    const devWalletAfter = await daiToken.balanceOf(devWallet.address);
    const funderWalletAfter = await daiToken.balanceOf(funder1.address);

    // Change token transfered
    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );
  });

  it('Take Offer 1 - Insufficient Remaining Insured Sum', async () => {
    const insuredSumDecimal = daiDecimal;
    const coverQtyDecimal = 18;

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('5000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinDAItoDAI.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    // Permit Data
    const nonce = await getNonceDAI(holder2.address);
    const signPermitDaiData: DAIPermit = await signPermitDai(
      holder2,
      pl.address,
      nonce.toNumber(),
      getNowUnix() + calculateDayInUnix(1)
    );
    const permitDataBytes: string = encodePermit(
      CURRENCY_TYPE.DAI,
      signPermitDaiData,
      encode
    );

    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: coverOfferId1,
      buyer: holder2.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinDAItoDAI,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: permitDataBytes,
    };

    // Calculate total premium
    const totalPremium = calculatePremium(
      dataBuyCover.coverQty,
      coverOfferData.premiumCostPerMonth,
      dataBuyCover.coverMonths
    );

    // Buy Cover Process
    await daiToken.connect(holder2).approve(pl.address, totalPremium);

    await expect(cg.connect(holder2).buyCover(dataBuyCover)).to.be.revertedWith(
      'ERR_CG_4'
    );
  });

  it('Claim Cover', async () => {
    // Set Mockup Keepers
    await setUpMockKeepers([dummyRoundId], 1627886940, {
      past: 740000,
      current: 740000,
      next: 740000,
    });

    const coverId = 0;
    await expect(
      claimGateway.connect(holder1).submitClaim(coverId, dummyRoundId)
    ).to.emit(claimData, 'ClaimRaise');
  });

  /**
   * Create Offer
   * Partial Uptake
   * scenario :
   * 1. funder create offer
   * 2. holder 1 try to buy cover partially, success.
   * 3. holder 2 try to buy cover partially, success.
   * 4. Claim Cover - Succedd
   * 5. holder 1 buy full cover, reverted because insufficient remaining insured sum .
   */
  it('Create Offer Cover 2 - Partial Uptake - DAI', async () => {
    // Set Mockup Keepers
    await setUpMockKeepers([dummyRoundId], 1627886940, {
      past: 1000000,
      current: 1000000,
    });
    const offerData: CoverOffer = {
      ...coverOfferData,
      premiumCurrency: CURRENCY_TYPE.DAI,
      funder: funder1.address,
      insuredSumRule: INSURED_RULE.PARTIAL, // Set to partial
    };
    await createCoverOffer(offerData, funder1);
  });

  it('Take Offer 2 - First time take partially, success', async () => {
    const insuredSumDecimal = daiDecimal;
    const coverQtyDecimal = 18;

    // Get Token Balance
    const devWalletBefore = await daiToken.balanceOf(devWallet.address);
    const funderWalletBefore = await daiToken.balanceOf(funder1.address);

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('1000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinDAItoDAI.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    // Permit Data
    const nonce = await getNonceDAI(holder1.address);
    const signPermitDaiData: DAIPermit = await signPermitDai(
      holder1,
      pl.address,
      nonce.toNumber(),
      getNowUnix() + calculateDayInUnix(1)
    );
    const permitDataBytes: string = encodePermit(
      CURRENCY_TYPE.DAI,
      signPermitDaiData,
      encode
    );

    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: coverOfferId2,
      buyer: holder1.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinDAItoDAI,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: permitDataBytes,
    };

    // Calculate total premium
    const totalPremium = calculatePremium(
      dataBuyCover.coverQty,
      coverOfferData.premiumCostPerMonth,
      dataBuyCover.coverMonths
    );

    // Buy Cover Process
    await daiToken.connect(holder1).approve(pl.address, totalPremium);
    await cg.connect(holder1).buyCover(dataBuyCover);

    // Get Token Balance
    const devWalletAfter = await daiToken.balanceOf(devWallet.address);
    const funderWalletAfter = await daiToken.balanceOf(funder1.address);

    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );
  });

  it('Take Offer 2 - Second time take partially, success', async () => {
    const insuredSumDecimal = daiDecimal;
    const coverQtyDecimal = 18;

    // Get Token Balance
    const devWalletBefore = await daiToken.balanceOf(devWallet.address);
    const funderWalletBefore = await daiToken.balanceOf(funder1.address);

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('1000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinDAItoDAI.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    // Permit Data
    const nonce = await getNonceDAI(holder2.address);
    const signPermitDaiData: DAIPermit = await signPermitDai(
      holder2,
      pl.address,
      nonce.toNumber(),
      getNowUnix() + calculateDayInUnix(1)
    );
    const permitDataBytes: string = encodePermit(
      CURRENCY_TYPE.DAI,
      signPermitDaiData,
      encode
    );

    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: coverOfferId2,
      buyer: holder2.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinDAItoDAI,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: permitDataBytes,
    };

    // Calculate total premium
    const totalPremium = calculatePremium(
      dataBuyCover.coverQty,
      coverOfferData.premiumCostPerMonth,
      dataBuyCover.coverMonths
    );
    // Buy Cover Process
    await daiToken.connect(holder2).approve(pl.address, totalPremium);

    await cg.connect(holder2).buyCover(dataBuyCover);

    // Get Token Balance
    const devWalletAfter = await daiToken.balanceOf(devWallet.address);
    const funderWalletAfter = await daiToken.balanceOf(funder1.address);

    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );
  });

  it('Claim Cover - Succedd', async () => {
    // Set Mockup Keepers
    await setUpMockKeepers([dummyRoundId], 1627886940, {
      past: 740000,
      current: 740000,
      next: 740000,
    });

    const coverId = 1;
    await expect(
      claimGateway.connect(holder1).submitClaim(coverId, dummyRoundId)
    ).to.emit(claimData, 'ClaimRaise');
  });

  it('Take Offer 2 - Full Uptake, reverted ', async () => {
    const insuredSumDecimal = daiDecimal;
    const coverQtyDecimal = 18;

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('5000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinDAItoDAI.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    // Permit Data
    const nonce = await getNonceDAI(holder1.address);
    const signPermitDaiData: DAIPermit = await signPermitDai(
      holder1,
      pl.address,
      nonce.toNumber(),
      getNowUnix() + calculateDayInUnix(1)
    );
    const permitDataBytes: string = encodePermit(
      CURRENCY_TYPE.DAI,
      signPermitDaiData,
      encode
    );

    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: coverOfferId2,
      buyer: holder1.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinDAItoDAI,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: permitDataBytes,
    };

    // Calculate total premium
    const totalPremium = calculatePremium(
      dataBuyCover.coverQty,
      coverOfferData.premiumCostPerMonth,
      dataBuyCover.coverMonths
    );

    // Buy Cover Process
    await daiToken.connect(holder1).approve(pl.address, totalPremium);
    await expect(cg.connect(holder1).buyCover(dataBuyCover)).to.be.revertedWith(
      'ERR_CG_4'
    );
  });
});
