import { BigNumberish } from '@ethersproject/bignumber';
import {
  ClaimGateway,
  CollectiveClaimGateway,
  CoverGateway,
  InfiToken,
  ListingData,
  PlatformData,
  Pool,
  UChildDAI,
  UChildUSDC,
  UsdtToken,
} from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers, network } from 'hardhat';

import {
  calculateDayInUnix,
  calculatePremium,
} from '../../utils/calculationUtils';
import {
  CURRENCY_TYPE,
  EMPTY_PERMIT_BYTES,
  INSURED_RULE,
  LISTING_TYPE,
} from '../../utils/constants';
import { createCoverOffer } from '../../utils/createOfferUtils';
import { getContract } from '../../utils/deployments';
import {
  BuyCover,
  CoverOffer,
  SignerWithAddress,
} from '../../utils/interfaces';
import { setUpMockKeepers } from '../../utils/keepersUtils';
import { signCoinPricingInfo } from '../../utils/signTypedDataUtils';
import { coverOfferData, dataCoinDAItoUSDT } from '../../utils/template';

const { expect } = chai;

describe('Create Offer until Claim, Invalid Claims 3', () => {
  let funder1: SignerWithAddress;
  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let devWallet: SignerWithAddress;
  let coinSigner: SignerWithAddress;
  let infiToken: InfiToken;
  let usdtToken: UsdtToken;
  let deployer: SignerWithAddress;
  let usdcToken: UChildUSDC;
  let daiToken: UChildDAI;
  let pool: Pool;
  let coverGateway: CoverGateway;
  let claimGateway: ClaimGateway;
  let collectiveClaimGateway: CollectiveClaimGateway;
  let listingData: ListingData;
  let usdtDecimal: number;
  let usdcDecimal: number;
  let daiDecimal: number;
  let devaluation: BigNumberish;
  let currentPrice: BigNumberish;
  let platformData: PlatformData;

  /**
   * Note
   * use block : 17077993
   * Precondition : checkClaimForDevaluation must return (false, 1000000, 6)
   * Scenario
   * - Funder Create Offer Cover - 1st
   * - Funder Create Offer Cover - 2nd
   * - Holder 1 Buy Cover - 1st
   * - Holder 2 Buy Cover - 2nd
   * - Holder 1 Make Claim
   * - Holder 2 Make Claim, No Payout
   * - Time travel to end of payout period
   * - Holder 1 failed to payout
   * - Holder 2 failed to payout
   * - Funder Collectively Take Back Deposit, Failed
   * - Validate Pending Claims
   * - Funder Collectively Take Back Deposit
   * - Payout Dev Wallet
   */

  before(async () => {
    await deployments.fixture(['Config', 'Encode', 'MockBalances'], {
      keepExistingDeployments: true,
    });

    ({
      funder1,
      holder1,
      holder2,
      coinSigner,
      devWallet,
      deployer,
    } = await ethers.getNamedSigners());

    infiToken = await getContract<InfiToken>('INFI');
    usdtToken = await getContract<UsdtToken>('USDT');
    usdcToken = await getContract<UChildUSDC>('USDC');
    daiToken = await getContract<UChildDAI>('DAI');
    coverGateway = await getContract<CoverGateway>('CoverGateway');
    claimGateway = await getContract<ClaimGateway>('ClaimGateway');
    collectiveClaimGateway = await getContract<CollectiveClaimGateway>(
      'CollectiveClaimGateway'
    );
    platformData = await getContract<PlatformData>('PlatformData');
    pool = await getContract<Pool>('Pool');
    listingData = await getContract<ListingData>('ListingData');

    usdtDecimal = parseInt((await usdtToken.decimals()).toString(), 0);
    usdcDecimal = await usdcToken.decimals();
    daiDecimal = await daiToken.decimals();

    devaluation = ethers.utils.parseUnits('0.25', 6);
    currentPrice = ethers.utils.parseUnits('1', 6).sub(devaluation);
  });

  describe('Flow 3', async () => {
    it('Funder Create Offer - 1st', async () => {
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

    it('Funder Create Offer - 2nd', async () => {
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

    it('Holder 1 Buy Cover - 1st', async () => {
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
          pool.address // verify by Cover Gateway Contract
        ),
        premiumPermit: EMPTY_PERMIT_BYTES,
      };

      // Calculate total premium
      const totalPremium = calculatePremium(
        dataBuyCover.coverQty,
        ethers.utils.parseUnits('0.5', usdtDecimal),
        dataBuyCover.coverMonths
      );

      // Buy Cover Process
      await usdtToken.connect(holder1).approve(pool.address, totalPremium);
      await coverGateway.connect(holder1).buyCover(dataBuyCover);

      // Get Token Balance
      const devWalletAfter = await usdtToken.balanceOf(devWallet.address);
      const funderWalletAfter = await usdtToken.balanceOf(funder1.address);

      expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
        devWalletAfter.add(funderWalletAfter).sub(totalPremium)
      );
    });

    it('Holder 2 Buy Cover - 2nd', async () => {
      const offerId = 1;
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
          pool.address // verify by Cover Gateway Contract
        ),
        premiumPermit: EMPTY_PERMIT_BYTES,
      };

      // Calculate total premium
      const totalPremium = calculatePremium(
        dataBuyCover.coverQty,
        ethers.utils.parseUnits('0.5', usdtDecimal), // based on offer,
        dataBuyCover.coverMonths
      );

      // Buy Cover Process
      await usdtToken.connect(holder2).approve(pool.address, totalPremium);
      await coverGateway.connect(holder2).buyCover(dataBuyCover);

      // Get Token Balance
      const devWalletAfter = await usdtToken.balanceOf(devWallet.address);
      const funderWalletAfter = await usdtToken.balanceOf(funder1.address);

      expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
        devWalletAfter.add(funderWalletAfter).sub(totalPremium)
      );
    });

    it('Holder 1 Make Claim', async () => {
      // Setup Mocking Pricefeed
      await setUpMockKeepers(['18446744073709555607'], 1627886940, {
        past: 740000,
        current: 740000,
        next: 1000000,
      });

      // payout directly send to holder
      const holderTokenBefore = await usdtToken.balanceOf(holder1.address);
      await claimGateway
        .connect(holder1)
        .submitClaim(0, '18446744073709555607');
      const holderTokenAfter = await usdtToken.balanceOf(holder1.address);
      expect(holderTokenAfter).to.eq(holderTokenBefore);
    });

    it('Holder 2 Make Claim , No Payout', async () => {
      // Setup Mocking Pricefeed
      await setUpMockKeepers(['18446744073709555936'], 1627886940, {
        past: 740000,
        current: 740000,
        next: 1000000,
      });

      // payout NOT directly send to holder
      const coverId = 1;
      const holderTokenBefore = await usdtToken.balanceOf(holder2.address);
      await claimGateway
        .connect(holder2)
        .submitClaim(coverId, '18446744073709555936');
      const holderTokenAfter = await usdtToken.balanceOf(holder2.address);
      expect(holderTokenAfter).to.eq(holderTokenBefore);
    });

    it('Time travel to end of payout period', async () => {
      // time travel
      const offerId = 1;
      const expiredOfferData = parseInt(
        (await listingData.getCoverOfferById(offerId)).expiredAt.toString(),
        0
      );
      await network.provider.send('evm_setNextBlockTimestamp', [
        expiredOfferData + 3600,
      ]);
      await network.provider.send('evm_mine');
    });

    it('Holder 1 failed to payout', async () => {
      const claimId = 0;
      await expect(claimGateway.checkPayout(claimId)).to.be.revertedWith(
        'ERR_CLG_9'
      );
    });

    it('Holder 2 failed to payout', async () => {
      const claimId = 1;
      await expect(claimGateway.checkPayout(claimId)).to.be.revertedWith(
        'ERR_CLG_9'
      );
    });

    it('Funder Collectively Take Back Deposit, Failed', async () => {
      await expect(
        collectiveClaimGateway
          .connect(funder1)
          .collectiveRefundDepositOfCoverOffer()
      ).to.be.revertedWith('ERR_CLG_21');
    });

    it('Validate Pending Claims', async () => {
      // Setup Mocking Pricefeed
      await setUpMockKeepers(
        ['18446744073709555936', '18446744073709555607'],
        1627886940,
        {
          past: 740000,
          current: 740000,
          next: 1000000,
        }
      );

      // Executr all Pending claims
      await claimGateway.validateAllPendingClaims(
        LISTING_TYPE.OFFER,
        funder1.address
      );
    });

    it('Funder Collectively Take Back Deposit', async () => {
      // check deposit data value after the expired time
      const depositDataAfterExpired = await collectiveClaimGateway.getDepositDataOfOfferCover(
        funder1.address
      );
      const withdrawableDepositAmount = ethers.utils.parseUnits(
        '10000',
        usdtDecimal
      );
      expect(depositDataAfterExpired.withdrawableDepositList[0]).to.eq(
        withdrawableDepositAmount
      );

      // funder will get all the money back since there is no valid claim
      const funderTokenBefore = await usdtToken.balanceOf(funder1.address);
      await collectiveClaimGateway
        .connect(funder1)
        .collectiveRefundDepositOfCoverOffer();
      const funderTokenAfter = await usdtToken.balanceOf(funder1.address);

      // check deposit data value after withdrawn
      const depositDataAfterWithdrawn = await collectiveClaimGateway.getDepositDataOfOfferCover(
        funder1.address
      );

      expect(depositDataAfterWithdrawn.withdrawableDepositList[0]).to.eq(0);
      const withdrawableDeposit = ethers.utils.parseUnits('10000', usdtDecimal);
      expect(funderTokenAfter).to.eq(
        funderTokenBefore.add(withdrawableDeposit)
      );
    });

    it('Payout Dev Wallet', async () => {
      // There is NO payout for dev
      const devTokenBefore = await usdtToken.balanceOf(devWallet.address);
      await claimGateway.connect(devWallet).withdrawExpiredPayout();
      const devTokenAfter = await usdtToken.balanceOf(devWallet.address);
      expect(devTokenAfter).to.eq(devTokenBefore);
    });
  });
});
