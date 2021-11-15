import { BigNumberish } from '@ethersproject/bignumber';
import {
  ClaimGateway,
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

describe('Create Offer until Claim, Invalid Claims 2', () => {
  let funder1: SignerWithAddress;
  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let devWallet: SignerWithAddress;
  let deployer: SignerWithAddress;
  let coinSigner: SignerWithAddress;
  let platformData: PlatformData;
  let infiToken: InfiToken;
  let usdtToken: UsdtToken;
  let usdcToken: UChildUSDC;
  let daiToken: UChildDAI;
  let pool: Pool;
  let coverGateway: CoverGateway;
  let claimGateway: ClaimGateway;
  let listingData: ListingData;
  let usdtDecimal: number;
  let usdcDecimal: number;
  let daiDecimal: number;
  let devaluation: BigNumberish;
  let currentPrice: BigNumberish;

  /**
   * Note
   * use block : 17077993
   * Precondition : checkClaimForDevaluation must return (false, 1000000, 6)
   * Scenario
   * - Funder Create Offer Cover
   * - Holder 1 Buy Cover
   * - Holder 2 Buy Cover
   * - Holder 1 Make Claim
   * - Holder 2 Make Claim, No Payout
   * - Funder Take Back Deposit, Failed
   * - Validate Pending Claims
   * - Funder Take Back Deposit
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
    pool = await getContract<Pool>('Pool');
    listingData = await getContract<ListingData>('ListingData');
    platformData = await getContract<PlatformData>('PlatformData');

    usdtDecimal = parseInt((await usdtToken.decimals()).toString(), 0);
    usdcDecimal = await usdcToken.decimals();
    daiDecimal = await daiToken.decimals();

    devaluation = ethers.utils.parseUnits('0.25', 6);
    currentPrice = ethers.utils.parseUnits('1', 6).sub(devaluation);
  });

  describe('Flow 2', async () => {
    it('Funder Create Offer', async () => {
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

    it('Holder 1 Buy Cover', async () => {
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

      console.log('usdtDecimal : ', usdtDecimal.toString());
      console.log('coverQtyInUnit : ', coverQtyInUnit.toString());
      console.log('insuredSumInUnit : ', insuredSumInUnit.toString());

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

    it('Holder 2 Buy Cover', async () => {
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
          pool.address // verify by Cover Gateway Contract
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

    it('Funder Take Back Deposit, Failed', async () => {
      // time travel
      const offerId = 0;
      const expiredOfferData = parseInt(
        (await listingData.getCoverOfferById(offerId)).expiredAt.toString(),
        0
      );
      await network.provider.send('evm_setNextBlockTimestamp', [
        expiredOfferData + 3600,
      ]);

      // funder will get all the money back since there is no valid claim
      await expect(
        claimGateway.connect(funder1).takeBackDepositOfCoverOffer(0)
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

      const offerId = 0;
      await claimGateway.validatePendingClaims(LISTING_TYPE.OFFER, offerId);
    });

    it('Funder Take Back Deposit', async () => {
      // funder will get all the money back since there is no valid claim
      const funderTokenBefore = await usdtToken.balanceOf(funder1.address);
      await claimGateway.connect(funder1).takeBackDepositOfCoverOffer(0);
      const funderTokenAfter = await usdtToken.balanceOf(funder1.address);
      const withdrawableDeposit = ethers.utils.parseUnits('5000', usdtDecimal);
      expect(funderTokenAfter).to.eq(
        funderTokenBefore.add(withdrawableDeposit)
      );
    });

    it('Payout Dev Wallet', async () => {
      // funder will get all the money back since there is no valid claim
      const devTokenBefore = await usdtToken.balanceOf(devWallet.address);
      await claimGateway.connect(devWallet).withdrawExpiredPayout();
      const devTokenAfter = await usdtToken.balanceOf(devWallet.address);
      expect(devTokenAfter).to.eq(devTokenBefore);
    });
  });
});
