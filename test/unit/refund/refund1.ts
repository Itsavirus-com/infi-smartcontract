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
  UsdtToken,
} from '@project/contracts/typechain';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { deployments, ethers, network } from 'hardhat';

import { calculateDayInUnix, getNowUnix } from '../utils/calculationUtils';
import {
  CURRENCY_TYPE,
  EMPTY_PERMIT_BYTES,
  INSURED_RULE,
} from '../utils/constants';
import { createCoverRequest } from '../utils/createRequestUtils';
import { getContract } from '../utils/deployments';
import {
  CoverRequest,
  ProvideCover,
  RequestData,
  SignerWithAddress,
} from '../utils/interfaces';
import {
  signCoinPricingInfo,
  signPermitDai,
} from '../utils/signTypedDataUtils';
import {
  coverRequestData,
  dataCoinInfi,
  dataCoinUSDT,
} from '../utils/template';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('Collect Premium by Funder', () => {
  // Defined variable
  let funder1: SignerWithAddress;
  let funder2: SignerWithAddress;
  let holder1: SignerWithAddress;
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
  let usdtDecimal: number;

  before(async () => {
    await deployments.fixture(['Config', 'Encode', 'MockBalances'], {
      keepExistingDeployments: true,
    });

    // Set time
    await network.provider.send('evm_setNextBlockTimestamp', [getNowUnix()]);

    ({
      devWallet,
      funder1,
      funder2,
      holder1,
      coinSigner,
    } = await ethers.getNamedSigners());

    // Get external contracts
    infiToken = await getContract<InfiToken>('INFI');
    usdtToken = await getContract<UsdtToken>('USDT');

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
  });

  /**
   * Scenario
   * - Holder 1 Create Cover Request
   * - Funder 1 Provide Funding
   * - Funder 2 Provide Funding
   * - Funder 2 Provide Funding again
   * - Funder 1 unsuccessfully collect premium before cover start
   * - Holder fail to refund remaining premium sum
   * - Time travel to start cover
   * - Holder success to refund remaining premium sum
   * - Holder fail to refund remaining premium sum, because already refunded
   * - Funder 2 forbiden to collect premium of funder 1's cover
   * - Funder 1 successfully collect premium with collectPremiumOfRequestByFunder function
   * - Funder 1 unsuccessfully collect premium with collectPremiumOfRequestByFunder function, because already collected
   * - Funder 2 successfully collect premium with collectivePremiumForFunder function
   * - Funder 1 cannot refund before cover ended
   * - Time travel to the end of cover
   * - Funder 2 forbiden to refund deposit of funder 1's cover
   * - Funder 1 successfully take back deposit from provide cover
   * - Funder 1 unsuccessfully take back deposit from provide cover, because fund already taken back
   * - Funder 2 success to collectively take back deposit from provide cover
   */
  it('Holder 1 Create Cover Request', async () => {
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
    };
    await createCoverRequest(data, holder1);
  });

  it('Funder 1 Provide Funding', async () => {
    const provideCoverData: ProvideCover = {
      requestId: 0, // cover request id
      provider: funder1.address,
      fundingSum: ethers.utils.parseUnits('1000', usdtDecimal),
      assetPricing: await signCoinPricingInfo(
        dataCoinUSDT,
        coinSigner,
        pl.address
      ), // verify by Cover Gateway
      assetPermit: EMPTY_PERMIT_BYTES,
    };

    // Approve USDT & make provide cover
    await usdtToken
      .connect(funder1)
      .approve(pl.address, provideCoverData.fundingSum);
    await cg.connect(funder1).provideCover(provideCoverData);
  });

  it('Funder 2 Provide Funding', async () => {
    const provideCoverData: ProvideCover = {
      requestId: 0, // cover request id
      provider: funder2.address,
      fundingSum: ethers.utils.parseUnits('1100', usdtDecimal),
      assetPricing: await signCoinPricingInfo(
        dataCoinUSDT,
        coinSigner,
        pl.address
      ), // verify by Cover Gateway
      assetPermit: EMPTY_PERMIT_BYTES,
    };

    // Approve USDT & make provide cover
    await usdtToken
      .connect(funder2)
      .approve(pl.address, provideCoverData.fundingSum);
    await cg.connect(funder2).provideCover(provideCoverData);
  });

  it('Funder 2 Provide Funding Again', async () => {
    const provideCoverData: ProvideCover = {
      requestId: 0, // cover request id
      provider: funder2.address,
      fundingSum: ethers.utils.parseUnits('200', usdtDecimal),
      assetPricing: await signCoinPricingInfo(
        dataCoinUSDT,
        coinSigner,
        pl.address
      ), // verify by Cover Gateway
      assetPermit: EMPTY_PERMIT_BYTES,
    };

    // Approve USDT & make provide cover
    await usdtToken
      .connect(funder2)
      .approve(pl.address, provideCoverData.fundingSum);
    await cg.connect(funder2).provideCover(provideCoverData);
  });

  it('Funder 1 unsuccessfully collect premium before cover start', async () => {
    // Failed collect premium because premium already collected
    const coverId = 0;

    // claim cover
    await expect(
      claimGateway.connect(funder1).collectPremiumOfRequestByFunder(coverId)
    ).to.be.revertedWith('ERR_CLG_2');
  });

  it('Holder fail to refund remaining premium sum of cover request', async () => {
    const requestId = 0;
    await expect(
      claimGateway.connect(holder1).refundPremium(requestId)
    ).to.be.revertedWith('ERR_CLG_16');
  });

  it('Time travel to start cover ', async () => {
    // Get expired time
    const coverId = 0;
    const listingExpiredAt = parseInt(
      (await ld.getCoverRequestById(coverId)).expiredAt.toString(),
      0
    );

    // Time travel to start cover
    await network.provider.send('evm_setNextBlockTimestamp', [
      listingExpiredAt,
    ]);
    await network.provider.send('evm_mine');
  });

  it('Holder success to refund remaining premium sum', async () => {
    const requestId = 0;
    // will check premium balance of funder (in usdt)
    const funderUSDTTokenBefore = await usdtToken.balanceOf(holder1.address);

    await claimGateway.connect(holder1).refundPremium(requestId);

    // check value
    const funderUSDTTokenAfter = await usdtToken.balanceOf(holder1.address);
    expect(funderUSDTTokenAfter.sub(funderUSDTTokenBefore)).to.eq(
      ethers.utils.parseUnits('70', usdtDecimal)
    );
  });

  it('Holder fail to refund remaining premium sum', async () => {
    const requestId = 0;

    await expect(
      claimGateway.connect(holder1).refundPremium(requestId)
    ).to.be.revertedWith('ERR_CLG_15');
  });

  it("Funder 2 forbiden to collect premium of funder 1's cover", async () => {
    const coverId = 0;
    await expect(
      claimGateway.connect(funder2).collectPremiumOfRequestByFunder(coverId)
    ).to.be.revertedWith('ERR_CLG_12');
  });

  it('Funder 1 successfully collect premium', async () => {
    // will check premium balance of funder (in usdt)
    const funderUSDTTokenBefore = await usdtToken.balanceOf(funder1.address);
    const devUSDTTokenBefore = await usdtToken.balanceOf(devWallet.address);

    const coverId = 0;
    // claim cover
    await claimGateway
      .connect(funder1)
      .collectPremiumOfRequestByFunder(coverId);

    // check value
    const funderUSDTTokenAfter = await usdtToken.balanceOf(funder1.address);
    const devUSDTTokenAfter = await usdtToken.balanceOf(devWallet.address);

    // Calculate premium for Funder and dev
    const totalPremium = ethers.utils.parseUnits('100', usdtDecimal);
    const premiumForFunder = totalPremium.mul(8).div(10);
    const premiumForDev = totalPremium.sub(premiumForFunder);
    // Evaluate
    expect(funderUSDTTokenAfter.sub(funderUSDTTokenBefore)).to.eq(
      premiumForFunder
    );
    expect(devUSDTTokenAfter.sub(devUSDTTokenBefore)).to.eq(premiumForDev);
  });

  it('Funder 1 unsuccessfully collect premium', async () => {
    // Failed collect premium because premium already collected
    const coverId = 0;

    // claim cover
    await expect(
      claimGateway.connect(funder1).collectPremiumOfRequestByFunder(coverId)
    ).to.be.revertedWith('ERR_CLG_13');
  });

  it('Funder 2 successfully collect premium collectively', async () => {
    // will check premium balance of funder (in usdt)
    const funderUSDTTokenBefore = await usdtToken.balanceOf(funder2.address);
    const devUSDTTokenBefore = await usdtToken.balanceOf(devWallet.address);

    await collectiveClaimGateway.connect(funder2).collectivePremiumForFunder();

    // check value
    const funderUSDTTokenAfter = await usdtToken.balanceOf(funder2.address);
    const devUSDTTokenAfter = await usdtToken.balanceOf(devWallet.address);

    // Calculate premium for Funder and dev
    const totalPremium = ethers.utils.parseUnits('130', usdtDecimal);
    const premiumForFunder = totalPremium.mul(8).div(10);
    const premiumForDev = totalPremium.sub(premiumForFunder);

    expect(funderUSDTTokenAfter.sub(funderUSDTTokenBefore)).to.eq(
      premiumForFunder
    );

    expect(devUSDTTokenAfter.sub(devUSDTTokenBefore)).to.eq(premiumForDev);
  });

  it('Funder 1 cannot refund before cover ended', async () => {
    const coverId = 0;
    await expect(
      claimGateway.connect(funder1).refundDepositOfProvideCover(coverId)
    ).to.be.revertedWith('ERR_CLG_25');
  });

  it('Time travel to the end of cover', async () => {
    const coverId = 0;
    const expiredOfCover = parseInt((await cg.getEndAt(coverId)).toString(), 0);

    // Time travel to start cover
    await network.provider.send('evm_setNextBlockTimestamp', [expiredOfCover]);
    await network.provider.send('evm_mine');
  });

  it("Funder 2 forbiden to refund deposit of funder 1's cover", async () => {
    const coverId = 0;
    await expect(
      claimGateway.connect(funder2).refundDepositOfProvideCover(coverId)
    ).to.be.revertedWith('ERR_CLG_12');
  });

  it('Funder 1 successfully take back deposit from provide cover', async () => {
    const coverId = 0;
    // will check premium balance of funder (in usdt)
    const funderUSDTTokenBefore = await usdtToken.balanceOf(funder1.address);

    await claimGateway.connect(funder1).refundDepositOfProvideCover(coverId);

    // check value
    const funderUSDTTokenAfter = await usdtToken.balanceOf(funder1.address);
    // funder balanc must be increasing
    expect(funderUSDTTokenAfter.sub(funderUSDTTokenBefore)).to.eq(
      ethers.utils.parseUnits('1000', usdtDecimal)
    );
  });

  it('Funder 1 unsuccessfully take back deposit from provide cover', async () => {
    const coverId = 0;
    await expect(
      claimGateway.connect(funder1).refundDepositOfProvideCover(coverId)
    ).to.be.revertedWith('ERR_CLG_22');
  });

  it('Funder 2 success to collectively take back deposit from provide cover', async () => {
    // will check premium balance of funder (in usdt)
    const funderUSDTTokenBefore = await usdtToken.balanceOf(funder2.address);

    await collectiveClaimGateway
      .connect(funder2)
      .collectiveRefundDepositOfProvideRequest();

    // check value
    const funderUSDTTokenAfter = await usdtToken.balanceOf(funder2.address);
    // funder balanc must be increasing
    expect(funderUSDTTokenAfter.sub(funderUSDTTokenBefore)).to.eq(
      ethers.utils.parseUnits('1300', usdtDecimal)
    );
  });
});
