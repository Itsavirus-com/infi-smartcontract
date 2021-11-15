import { BigNumberish } from '@ethersproject/bignumber';
import {
  ClaimData,
  ClaimGateway,
  CollectiveClaimGateway,
  PlatformData,
  CoverGateway,
  InfiToken,
  ListingData,
  Pool,
  UChildDAI,
  UChildUSDC,
  UsdtToken,
} from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers, network } from 'hardhat';
import { calculateDayInUnix } from '../../utils/calculationUtils';
import {
  CURRENCY_TYPE,
  EMPTY_PERMIT_BYTES,
  INSURED_RULE,
  LISTING_TYPE,
} from '../../utils/constants';
import { createCoverRequest } from '../../utils/createRequestUtils';
import { getContract } from '../../utils/deployments';
import {
  ProvideCover,
  RequestData,
  SignerWithAddress,
} from '../../utils/interfaces';
import { signCoinPricingInfo } from '../../utils/signTypedDataUtils';
import { coverRequestData, dataCoinUSDT } from '../../utils/template';
import { setUpMockKeepers } from '../../utils/keepersUtils';

const { expect } = chai;

describe('Create Request until Claim', () => {
  let funder1: SignerWithAddress;
  let funder2: SignerWithAddress;
  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let devWallet: SignerWithAddress;
  let coinSigner: SignerWithAddress;
  let infiToken: InfiToken;
  let platformData: PlatformData;
  let deployer: SignerWithAddress;
  let usdtToken: UsdtToken;
  let usdcToken: UChildUSDC;
  let daiToken: UChildDAI;
  let pool: Pool;
  let coverGateway: CoverGateway;
  let claimGateway: ClaimGateway;
  let collectiveClaimGateway: CollectiveClaimGateway;
  let claimData: ClaimData;
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
   * - Holder 1 Create Cover Request
   * - Funder 1 Provide Request - 1st
   * - Funder 2 Provide Request - 1st
   *
   * - Holder 2 Create Cover Request
   * - Funder 1 Provide Request - 2nd
   *
   * - Holder 1 Make Claim, No Payout
   *
   * - Time Travel to End of payout time
   * - Holder failed to payout
   * - Holder failed to payout
   * - Funder 1 Take Back Deposit Collectively, Failed
   * - Validate Pending Claims
   * - Funder 1 Take Back Deposit Collectively
   * - Funder 2 Take Back Deposit
   *
   * - Payout Dev Wallet
   */

  before(async () => {
    await deployments.fixture(['Config', 'Encode', 'MockBalances'], {
      keepExistingDeployments: true,
    });

    ({
      funder1,
      funder2,
      holder1,
      holder2,
      devWallet,
      coinSigner,
      deployer,
    } = await ethers.getNamedSigners());

    infiToken = await getContract<InfiToken>('INFI');
    usdtToken = await getContract<UsdtToken>('USDT');
    usdcToken = await getContract<UChildUSDC>('USDC');
    daiToken = await getContract<UChildDAI>('DAI');
    coverGateway = await getContract<CoverGateway>('CoverGateway');
    claimGateway = await getContract<ClaimGateway>('ClaimGateway');
    claimData = await getContract<ClaimData>('ClaimData');
    collectiveClaimGateway = await getContract<CollectiveClaimGateway>(
      'CollectiveClaimGateway'
    );
    pool = await getContract<Pool>('Pool');
    listingData = await getContract<ListingData>('ListingData');
    platformData = await getContract<PlatformData>('PlatformData');

    usdtDecimal = parseInt((await usdtToken.decimals()).toString(), 0);
    usdcDecimal = await usdcToken.decimals();
    daiDecimal = await daiToken.decimals();

    devaluation = ethers.utils.parseUnits('0.25', 6);
    currentPrice = ethers.utils.parseUnits('1', 6).sub(devaluation);
  });

  describe('Flow 3 ', async () => {
    it('Holder 1 Create Request', async () => {
      const currentBlockTimestamp = (await ethers.provider.getBlock('latest'))
        .timestamp;
      // Process
      const data: RequestData = {
        ...coverRequestData,
        insuredSum: ethers.utils.parseUnits('3000', usdtDecimal),
        insuredSumTarget: ethers.utils.parseUnits('3000', usdtDecimal), // tolerance 2 token
        insuredSumCurrency: CURRENCY_TYPE.USDT,
        premiumSum: ethers.utils.parseUnits('300', usdtDecimal),
        premiumCurrency: CURRENCY_TYPE.USDT,
        holder: holder1.address,
        insuredSumRule: INSURED_RULE.PARTIAL,
        expiredAt: currentBlockTimestamp + calculateDayInUnix(10),
      };
      await createCoverRequest(data, holder1);
    });

    it('Funder 1 Provide Request - 1st', async () => {
      const provideCoverData: ProvideCover = {
        requestId: 0, // cover request id
        provider: funder1.address,
        fundingSum: ethers.utils.parseUnits('1000', usdtDecimal),
        assetPricing: await signCoinPricingInfo(
          dataCoinUSDT,
          coinSigner,
          pool.address
        ), // verify by Cover Gateway
        assetPermit: EMPTY_PERMIT_BYTES,
      };

      // Approve USDT & make provide cover
      await usdtToken
        .connect(funder1)
        .approve(pool.address, provideCoverData.fundingSum);
      await coverGateway.connect(funder1).provideCover(provideCoverData);
    });

    it('Funder 2 Provide Request - 1st', async () => {
      const provideCoverData: ProvideCover = {
        requestId: 0, // cover request id
        provider: funder2.address,
        fundingSum: ethers.utils.parseUnits('2000', usdtDecimal),
        assetPricing: await signCoinPricingInfo(
          dataCoinUSDT,
          coinSigner,
          pool.address
        ), // verify by Cover Gateway
        assetPermit: EMPTY_PERMIT_BYTES,
      };

      // Approve USDT & make provide cover
      await usdtToken
        .connect(funder2)
        .approve(pool.address, provideCoverData.fundingSum);
      await coverGateway.connect(funder2).provideCover(provideCoverData);
    });

    it('Holder 2 Create Request', async () => {
      const currentBlockTimestamp = (await ethers.provider.getBlock('latest'))
        .timestamp;
      // Process
      const data: RequestData = {
        ...coverRequestData,
        insuredSum: ethers.utils.parseUnits('3000', usdtDecimal),
        insuredSumTarget: ethers.utils.parseUnits('3000', usdtDecimal), // tolerance 2 token
        insuredSumCurrency: CURRENCY_TYPE.USDT,
        premiumSum: ethers.utils.parseUnits('300', usdtDecimal),
        premiumCurrency: CURRENCY_TYPE.USDT,
        holder: holder2.address,
        insuredSumRule: INSURED_RULE.PARTIAL,
        expiredAt: currentBlockTimestamp + calculateDayInUnix(10),
      };
      await createCoverRequest(data, holder2);
    });

    it('Funder 1 Provide Request - 2nd', async () => {
      const provideCoverData: ProvideCover = {
        requestId: 1, // cover request id
        provider: funder1.address,
        fundingSum: ethers.utils.parseUnits('3000', usdtDecimal),
        assetPricing: await signCoinPricingInfo(
          dataCoinUSDT,
          coinSigner,
          pool.address
        ), // verify by Cover Gateway
        assetPermit: EMPTY_PERMIT_BYTES,
      };

      // Approve USDT & make provide cover
      await usdtToken
        .connect(funder1)
        .approve(pool.address, provideCoverData.fundingSum);
      await coverGateway.connect(funder1).provideCover(provideCoverData);
    });

    it('Holder 1 Make Claim, No Payout', async () => {
      // Setup Mocking Pricefeed
      await setUpMockKeepers(['18446744073709555936'], 1627886940, {
        past: 740000,
        current: 740000,
        next: 1000000,
      });

      // payout NOT directly send to holder
      const requestId = 0;
      const holderTokenBefore = await usdtToken.balanceOf(holder1.address);
      await collectiveClaimGateway
        .connect(holder1)
        .collectiveSubmitClaim(requestId, '18446744073709555936');
      const holderTokenAfter = await usdtToken.balanceOf(holder1.address);
      expect(holderTokenAfter).to.eq(holderTokenBefore);
    });

    it('Time travel to end of payout time', async () => {
      // Time travel passing expired date
      const coverId = 0;
      const expiredDate = parseInt(
        (await coverGateway.getEndAt(coverId)).toString(),
        0
      );
      await network.provider.send('evm_setNextBlockTimestamp', [
        expiredDate + 60,
      ]);
    });

    it('Holder failed to payout', async () => {
      const collectiveClaimId = 0;
      await expect(
        collectiveClaimGateway.checkPayout(collectiveClaimId)
      ).to.be.revertedWith('ERR_CLG_9');
    });

    it('Funder 1 Take Back Deposit Collectively, Failed', async () => {
      await expect(
        collectiveClaimGateway
          .connect(funder1)
          .collectiveRefundDepositOfProvideRequest()
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
      // Validate Pending Claims
      await claimGateway.validateAllPendingClaims(
        LISTING_TYPE.REQUEST,
        funder1.address
      );
    });

    it('Funder 1 Take Back Deposit Collectively', async () => {
      // Funder will get all the money back since there is no valid claim
      const funderTokenBefore = await usdtToken.balanceOf(funder1.address);
      await collectiveClaimGateway
        .connect(funder1)
        .collectiveRefundDepositOfProvideRequest();
      const funderTokenAfter = await usdtToken.balanceOf(funder1.address);
      const depositLeft = ethers.utils.parseUnits('4000', usdtDecimal);
      expect(funderTokenAfter).to.eq(funderTokenBefore.add(depositLeft));
    });

    it('Funder 2 Take Back Deposit', async () => {
      // Funder will get all the money back since there is no valid claim
      const funderTokenBefore = await usdtToken.balanceOf(funder2.address);
      await claimGateway.connect(funder2).refundDepositOfProvideCover(1);
      const funderTokenAfter = await usdtToken.balanceOf(funder2.address);
      const depositLeft = ethers.utils.parseUnits('2000', usdtDecimal);
      expect(funderTokenAfter).to.eq(funderTokenBefore.add(depositLeft));
    });

    it('Payout Dev Wallet', async () => {
      // check value
      const devTokenBefore = await usdtToken.balanceOf(devWallet.address);
      await claimGateway.connect(devWallet).withdrawExpiredPayout();
      const devTokenAfter = await usdtToken.balanceOf(devWallet.address);
      expect(devTokenAfter).to.eq(devTokenBefore);
    });
  });
});
