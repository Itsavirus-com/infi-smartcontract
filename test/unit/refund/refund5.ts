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

import { calculateDayInUnix } from '../utils/calculationUtils';
import {
  CURRENCY_TYPE,
  EMPTY_PERMIT_BYTES,
  INSURED_RULE,
} from '../utils/constants';
import { createCoverRequest } from '../utils/createRequestUtils';
import { getContract } from '../utils/deployments';
import {
  ProvideCover,
  RequestData,
  SignerWithAddress,
} from '../utils/interfaces';
import { setUpMockKeepers } from '../utils/keepersUtils';
import { signCoinPricingInfo } from '../utils/signTypedDataUtils';
import { coverRequestData, dataCoinUSDT } from '../utils/template';

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
  - Holder create cover request
  - Funder 1 funding request
  - Funder 2 funding request, cover started
  - Holder make a success collective claim for request
  - Holder make a fail collective claim for request
  */

  it('Holder create cover request', async () => {
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
      expiredAt: 1634152440 + calculateDayInUnix(10),
    };
    await createCoverRequest(data, holder1);
  });

  it('Funder 1 funding request', async () => {
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

  it('Funder 2 funding request, cover started', async () => {
    const provideCoverData: ProvideCover = {
      requestId: 0, // cover request id
      provider: funder2.address,
      fundingSum: ethers.utils.parseUnits('2000', usdtDecimal),
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

  it('Holder make a success collective claim for request', async () => {
    // Set Mockup Keepers
    await setUpMockKeepers([dummyRoundId], 1634293692, {
      past: 740000,
      current: 740000,
      next: 740000,
    });

    // Time travel
    await network.provider.send('evm_setNextBlockTimestamp', [1634556592]);
    await network.provider.send('evm_mine');

    // balance of holder before colectove claim
    const balanceBefore = await usdtToken.balanceOf(holder1.address);

    // make a colletive claim process
    await collectiveClaimGateway
      .connect(holder1)
      .collectiveSubmitClaim(0, dummyRoundId);

    // balance of holder before colectove claim
    const balanceAfter = await usdtToken.balanceOf(holder1.address);

    // Calculate payout
    const devaluation = ethers.utils.parseUnits('0.26', 6);
    const currentPrice = ethers.utils.parseUnits('1', 6).sub(devaluation);
    const payout = ethers.utils
      .parseUnits('3000', usdtDecimal)
      .mul(devaluation)
      .div(currentPrice);

    expect(balanceAfter.sub(balanceBefore)).to.be.eq(payout);
  });

  it('Holder make a fail collective claim for request', async () => {
    // balance of holder before colectove claim
    const balanceBefore = await usdtToken.balanceOf(holder1.address);

    // Cannot get payout because using same roundId
    await expect(
      collectiveClaimGateway
        .connect(holder1)
        .collectiveSubmitClaim(0, dummyRoundId)
    ).to.be.revertedWith('ERR_CLG_4');
  });
});
