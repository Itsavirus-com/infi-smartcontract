import {
  ClaimData,
  ClaimGateway,
  CollectiveClaimGateway,
  CoverData,
  CoverGateway,
  Encode,
  InfiToken,
  ListingData,
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
  calculatePremium,
  getNowUnix,
} from '../utils/calculationUtils';
import {
  CURRENCY_TYPE,
  EMPTY_PERMIT_BYTES,
  INSURED_RULE,
} from '../utils/constants';
import { createCoverOffer } from '../utils/createOfferUtils';
import { getContract } from '../utils/deployments';
import { BuyCover, CoverOffer, SignerWithAddress } from '../utils/interfaces';
import { setUpMockKeepers } from '../utils/keepersUtils';
import { signCoinPricingInfo } from '../utils/signTypedDataUtils';
import { coverOfferData, dataCoinDAItoUSDT } from '../utils/template';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('Collect Premium by Funder', () => {
  // Defined variable
  let funder1: SignerWithAddress;
  let funder2: SignerWithAddress;
  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let devWallet: SignerWithAddress;
  let coinSigner: SignerWithAddress;
  let encode: Encode;
  let ld: ListingData;
  let pl: Pool;
  let cd: CoverData;
  let cg: CoverGateway;
  let claimData: ClaimData;
  let claimGateway: ClaimGateway;
  let collectiveClaimGateway: CollectiveClaimGateway;
  let infiToken: InfiToken;
  let usdtToken: UsdtToken;
  let usdcToken: UChildUSDC;
  let daiToken: UChildDAI;
  let usdtDecimal: number;
  let usdcDecimal: number;
  let daiDecimal: number;
  const dummyRoundId = '18446744073709555607';

  before(async () => {
    await deployments.fixture(['Config', 'Encode', 'MockBalances'], {
      keepExistingDeployments: true,
    });

    // Set time
    await network.provider.send('evm_setNextBlockTimestamp', [1634152440]);

    ({
      devWallet,
      funder1,
      funder2,
      holder1,
      holder2,
      coinSigner,
    } = await ethers.getNamedSigners());

    // Get external contracts
    infiToken = await getContract<InfiToken>('INFI');
    usdtToken = await getContract<UsdtToken>('USDT');
    usdcToken = await getContract<UChildUSDC>('USDC');
    daiToken = await getContract<UChildDAI>('DAI');

    // Get fresh contract
    encode = await getContract<Encode>('Encode');
    ld = await getContract<ListingData>('ListingData');
    pl = await getContract<Pool>('Pool');
    cd = await getContract<CoverData>('CoverData');
    cg = await getContract<CoverGateway>('CoverGateway');
    claimData = await getContract<ClaimData>('ClaimData');
    claimGateway = await getContract<ClaimGateway>('ClaimGateway');
    collectiveClaimGateway = await getContract<CollectiveClaimGateway>(
      'CollectiveClaimGateway'
    );

    usdtDecimal = parseInt((await usdtToken.decimals()).toString(), 0);
    usdcDecimal = await usdcToken.decimals();
    daiDecimal = await daiToken.decimals();
  });

  /**
  Scenario
  - Funder 1 Create Offer Cover with USDT as collateral (first offer)
  - Funder 1 Create Offer Cover with USDC as collateral (second offer)
  - Funder 1 Create Offer Cover with DAI as collateral (third offer)
  - Holder 1 Buy first offer (first cover)
  - Holder 1 Make success claim over first offer
  - Time travel to 15 day before expired at of first offer
  - Holder 2 Buy first offer (second cover)
  - Time travel to expired at of first offer
  - Funder 1 fail to take back deposit of first offer, because still exists active cove from holder 2
  - Time travel to expired of second cover
  - Funder 1 success to take back deposit of first offer
  - Funder 1 success ecollectively to take back deposit of second & third offer
  */
  it('Funder 1 Create Offer Cover with USDT as collateral', async () => {
    const currentBlockTimestamp = (await ethers.provider.getBlock('latest'))
      .timestamp;
    const lockPeriod = calculateDayInUnix(12 * 30);
    const offerData: CoverOffer = {
      ...coverOfferData,
      funder: funder1.address,
      insuredSum: ethers.utils.parseUnits('5000', usdtDecimal),
      insuredSumCurrency: CURRENCY_TYPE.USDT,
      premiumCostPerMonth: ethers.utils.parseUnits('0.5', usdtDecimal),
      premiumCurrency: CURRENCY_TYPE.USDT,
      insuredSumRule: INSURED_RULE.PARTIAL,
      expiredAt: currentBlockTimestamp + lockPeriod,
    };
    await createCoverOffer(offerData, funder1);
  });

  it('Funder 1 Create Offer Cover with USDC as collateral', async () => {
    const currentBlockTimestamp = (await ethers.provider.getBlock('latest'))
      .timestamp;
    const lockPeriod = calculateDayInUnix(12 * 30);
    const offerData: CoverOffer = {
      ...coverOfferData,
      funder: funder1.address,
      insuredSum: ethers.utils.parseUnits('5000', usdcDecimal),
      insuredSumCurrency: CURRENCY_TYPE.USDC,
      premiumCostPerMonth: ethers.utils.parseUnits('0.5', usdcDecimal),
      premiumCurrency: CURRENCY_TYPE.USDC,
      insuredSumRule: INSURED_RULE.FULL,
      expiredAt: currentBlockTimestamp + lockPeriod,
    };
    await createCoverOffer(offerData, funder1);
  });

  it('Funder 1 Create Offer Cover with DAI as collateral', async () => {
    const currentBlockTimestamp = (await ethers.provider.getBlock('latest'))
      .timestamp;
    const lockPeriod = calculateDayInUnix(12 * 30);
    const offerData: CoverOffer = {
      ...coverOfferData,
      funder: funder1.address,
      insuredSum: ethers.utils.parseUnits('5000', daiDecimal),
      insuredSumCurrency: CURRENCY_TYPE.DAI,
      premiumCostPerMonth: ethers.utils.parseUnits('0.5', daiDecimal),
      premiumCurrency: CURRENCY_TYPE.DAI,
      insuredSumRule: INSURED_RULE.FULL,
      expiredAt: currentBlockTimestamp + lockPeriod,
    };

    await createCoverOffer(offerData, funder1);
  });

  it('Holder 1 Buy first offer', async () => {
    const offerId = 0;
    const insuredSumDecimal = usdtDecimal;
    const coverQtyDecimal = 18;

    // Get Token Balance
    const devWalletBefore = await usdtToken.balanceOf(devWallet.address);
    const funderWalletBefore = await usdtToken.balanceOf(funder1.address);

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('1000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinDAItoUSDT.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId,
      buyer: holder1.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinDAItoUSDT,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: EMPTY_PERMIT_BYTES,
    };

    // Calculate total premium
    const totalPremium = calculatePremium(
      dataBuyCover.coverQty,
      ethers.utils.parseUnits('0.5', usdcDecimal), // based on offer
      dataBuyCover.coverMonths
    );

    // Buy Cover Process
    await usdtToken.connect(holder1).approve(pl.address, totalPremium);
    await cg.connect(holder1).buyCover(dataBuyCover);

    // Get Token Balance
    const devWalletAfter = await usdtToken.balanceOf(devWallet.address);
    const funderWalletAfter = await usdtToken.balanceOf(funder1.address);

    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );
  });

  it('Holder 1 Make success claim over first offer', async () => {
    // Set Mockup Keepers
    await setUpMockKeepers([dummyRoundId], 1634293692, {
      past: 740000,
      current: 740000,
      next: 740000,
    });

    // Time travel to passing monitoring period
    await network.provider.send('evm_setNextBlockTimestamp', [1634556592]);
    await network.provider.send('evm_mine');

    // With condition devaluation 26% from 1USD
    // asset price = 0.74 USD
    // balance before claim
    const balanceBeforeClaim = await usdtToken.balanceOf(holder1.address);

    // Make claim
    const coverId = 0;
    await claimGateway.connect(holder1).submitClaim(coverId, dummyRoundId);

    // balance after claim
    const balanceAfterClaim = await usdtToken.balanceOf(holder1.address);

    const devaluation = ethers.utils.parseUnits('0.26', 6);
    const currentPrice = ethers.utils.parseUnits('1', 6).sub(devaluation);
    const payout = ethers.utils
      .parseUnits('1000', usdtDecimal)
      .mul(devaluation)
      .div(currentPrice);

    expect(balanceAfterClaim).to.be.eq(balanceBeforeClaim.add(payout));
  });

  it('Time travel to 15 day before expired at of first offer', async () => {
    const firstOfferId = 0;
    const expiredTimeFirstOffer = (
      await ld.getCoverOfferById(firstOfferId)
    ).expiredAt.toNumber();
    // 15 day before expired time of first offer
    const destination = expiredTimeFirstOffer - calculateDayInUnix(15);

    // Time travel to 15 day before expired time of first offer
    await network.provider.send('evm_setNextBlockTimestamp', [destination]);
    await network.provider.send('evm_mine');
  });

  it('Holder 2 Buy first offer', async () => {
    const offerId = 0;
    const insuredSumDecimal = usdtDecimal;
    const coverQtyDecimal = 18;

    // Get Token Balance
    const devWalletBefore = await usdtToken.balanceOf(devWallet.address);
    const funderWalletBefore = await usdtToken.balanceOf(funder1.address);

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('1000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinDAItoUSDT.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId,
      buyer: holder2.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinDAItoUSDT,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: EMPTY_PERMIT_BYTES,
    };

    // Calculate total premium
    const totalPremium = calculatePremium(
      dataBuyCover.coverQty,
      ethers.utils.parseUnits('0.5', usdtDecimal), // based on offer
      dataBuyCover.coverMonths
    );

    // Buy Cover Process
    await usdtToken.connect(holder2).approve(pl.address, totalPremium);
    await cg.connect(holder2).buyCover(dataBuyCover);

    // Get Token Balance
    const devWalletAfter = await usdtToken.balanceOf(devWallet.address);
    const funderWalletAfter = await usdtToken.balanceOf(funder1.address);

    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );
  });

  it('Time travel to expired at of first offer', async () => {
    const firstOfferId = 0;
    const expiredTimeFirstOffer = (
      await ld.getCoverOfferById(firstOfferId)
    ).expiredAt.toNumber();

    // Time travel to expired time of first offer
    await network.provider.send('evm_setNextBlockTimestamp', [
      expiredTimeFirstOffer,
    ]);
    await network.provider.send('evm_mine');
  });

  it('Funder 1 fail to take back deposit of first offer', async () => {
    const firstOfferId = 0;
    await expect(
      claimGateway.connect(funder1).takeBackDepositOfCoverOffer(firstOfferId)
    ).to.be.revertedWith('ERR_CLG_20');
  });

  it('Time travel to expired at of second cover', async () => {
    const coverId = 1;
    const expiredTimeSecondCover = parseInt(
      (await cg.getEndAt(coverId)).toString(),
      0
    );

    await network.provider.send('evm_setNextBlockTimestamp', [
      expiredTimeSecondCover,
    ]);
    await network.provider.send('evm_mine');
  });

  it('Funder 1 success to take back deposit of first offer', async () => {
    // balance before claim
    const balanceBeforeTakeBackDeposit = await usdtToken.balanceOf(
      funder1.address
    );

    // take back deposit
    const firstOfferId = 0;
    await claimGateway
      .connect(funder1)
      .takeBackDepositOfCoverOffer(firstOfferId);

    // balance after claim
    const balanceAfterTakeBackDeposit = await usdtToken.balanceOf(
      funder1.address
    );

    const insuredSum = ethers.utils.parseUnits('5000', usdtDecimal);
    const devaluation = ethers.utils.parseUnits('0.26', 6);
    const currentPrice = ethers.utils.parseUnits('1', 6).sub(devaluation);
    const payout = ethers.utils
      .parseUnits('1000', usdtDecimal)
      .mul(devaluation)
      .div(currentPrice);
    const depositLeft = insuredSum.sub(payout);

    expect(
      balanceAfterTakeBackDeposit.sub(balanceBeforeTakeBackDeposit)
    ).to.be.eq(depositLeft);
  });

  it('Funder 1 success collectively to take back deposit of second & third offer', async () => {
    // Time travel to passing Second and Third Offer
    const offerData = await ld.getCoverOfferById(2);
    const expiredTimeThirdOffer = parseInt(offerData.expiredAt.toString(), 0);
    await network.provider.send('evm_setNextBlockTimestamp', [
      expiredTimeThirdOffer,
    ]);
    await network.provider.send('evm_mine');

    // balance before take back deposit
    const usdcBefore = await usdcToken.balanceOf(funder1.address);
    const daiBefore = await daiToken.balanceOf(funder1.address);

    await collectiveClaimGateway
      .connect(funder1)
      .collectiveRefundDepositOfCoverOffer();

    // balance after take back deposit
    const usdcAfter = await usdcToken.balanceOf(funder1.address);
    const daiAfter = await daiToken.balanceOf(funder1.address);

    // check value
    expect(usdcAfter.sub(usdcBefore)).to.be.equal(
      ethers.utils.parseUnits('5000', usdcDecimal)
    );
    expect(daiAfter.sub(daiBefore)).to.be.equal(
      ethers.utils.parseUnits('5000', daiDecimal)
    );
  });
});
