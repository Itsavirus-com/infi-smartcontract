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
  let coinSigner: SignerWithAddress;
  let infiToken: InfiToken;
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
  let deployer: SignerWithAddress;
  let platformData: PlatformData;

  /**
   * Note
   * use block : 17077993
   * Precondition : checkClaimForDevaluation must return (true, 740000, 6)
   * Scenario
   * - Holder Create Cover Request
   * - Funder 1 Provide Cover
   * - Funder 2 Provide Cover
   * - Holder Make Claim
   * - Holder Make Claim, No Payout
   * - Holder Payout
   * - Funder 1 Take Back Deposit
   * - Funder 2 Take Back Deposit
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

    devaluation = ethers.utils.parseUnits('0.26', 6);
    currentPrice = ethers.utils.parseUnits('1', 6).sub(devaluation);
  });

  describe('Flow 1 ', async () => {
    it('Holder Create Request', async () => {
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

    it('Funder 1 Provide Request', async () => {
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

    it('Funder 2 Provide Request', async () => {
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

    it('Holder Make Claim, No Payout', async () => {
      await setUpMockKeepers(['18446744073709555936'], 1627886940, {
        past: 740000,
        current: 740000,
        next: 740000,
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

    it('Holder Payout', async () => {
      await setUpMockKeepers(['18446744073709555936'], 1627886940, {
        past: 740000,
        current: 740000,
        next: 740000,
      });

      // Take Payout
      const collectiveClaimId = 0;
      // Jump to end 72 hour to make sure pass monitoring time
      const currentBlockTimestamp = (await ethers.provider.getBlock('latest'))
        .timestamp;
      const expiredAt = currentBlockTimestamp + calculateDayInUnix(4);
      await network.provider.send('evm_setNextBlockTimestamp', [expiredAt]);
      // Check Payout, must get payout money
      const holderTokenBefore = await usdtToken.balanceOf(holder1.address);
      await collectiveClaimGateway
        .connect(holder1)
        .checkPayout(collectiveClaimId);
      const holderTokenAfter = await usdtToken.balanceOf(holder1.address);
      const payout = ethers.utils
        .parseUnits('3000', usdtDecimal)
        .mul(devaluation)
        .div(currentPrice);
      expect(holderTokenAfter).to.eq(holderTokenBefore.add(payout));
    });

    it('Funder 1 Take Back Deposit', async () => {
      // Time travel passing expired date
      const coverId = 0;
      const expiredDate = parseInt(
        (await coverGateway.getEndAt(coverId)).toString(),
        0
      );
      await network.provider.send('evm_setNextBlockTimestamp', [
        expiredDate + 60,
      ]);

      // check value
      const funderTokenBefore = await usdtToken.balanceOf(funder1.address);
      await claimGateway.connect(funder1).refundDepositOfProvideCover(0);
      const funderTokenAfter = await usdtToken.balanceOf(funder1.address);
      const payout = ethers.utils
        .parseUnits('1000', usdtDecimal)
        .mul(devaluation)
        .div(currentPrice);
      const depositLeft = ethers.utils
        .parseUnits('1000', usdtDecimal)
        .sub(payout);
      expect(funderTokenAfter).to.eq(funderTokenBefore.add(depositLeft));
    });

    it('Funder 2 Take Back Deposit', async () => {
      // check value
      const funderTokenBefore = await usdtToken.balanceOf(funder2.address);
      await claimGateway.connect(funder2).refundDepositOfProvideCover(1);
      const funderTokenAfter = await usdtToken.balanceOf(funder2.address);
      const payout = ethers.utils
        .parseUnits('2000', usdtDecimal)
        .mul(devaluation)
        .div(currentPrice);
      const depositLeft = ethers.utils
        .parseUnits('2000', usdtDecimal)
        .sub(payout);
      expect(funderTokenAfter).to.eq(funderTokenBefore.add(depositLeft));
    });
  });
});
