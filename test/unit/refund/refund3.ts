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
  let usdcToken: UChildUSDC;
  let daiToken: UChildDAI;
  let usdtDecimal: number;
  let usdcDecimal: number;
  let daiDecimal: number;

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
   * Scenario
   * - Holder 1 Create Cover Request using USDT as premium currency
   * - Holder 1 Create Cover Request using USDT as premium currency
   * - Holder 1 Create Cover Request using DAI as premium currency
   * - Holder 1 Create Cover Request using USDC as premium currency
   * - Funder 1 Provide Funding on first request
   * - Time travel to expired time of fourth request
   */
  it('Holder 1 Create Cover Request (first request)', async () => {
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

  it('Holder 1 Create Cover Request (second request)', async () => {
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

  it('Holder 1 Create Cover Request (third request)', async () => {
    // Process
    const data: RequestData = {
      ...coverRequestData,
      insuredSum: ethers.utils.parseUnits('3000', daiDecimal),
      insuredSumTarget: ethers.utils.parseUnits('3000', daiDecimal), // tolerance 2 token
      insuredSumCurrency: CURRENCY_TYPE.DAI,
      premiumSum: ethers.utils.parseUnits('300', daiDecimal),
      premiumCurrency: CURRENCY_TYPE.DAI,
      holder: holder1.address,
      insuredSumRule: INSURED_RULE.PARTIAL,
    };
    await createCoverRequest(data, holder1);
  });

  it('Holder 1 Create Cover Request (fourth request)', async () => {
    // Process
    const data: RequestData = {
      ...coverRequestData,
      insuredSum: ethers.utils.parseUnits('3000', usdcDecimal),
      insuredSumTarget: ethers.utils.parseUnits('3000', usdcDecimal), // tolerance 2 token
      insuredSumCurrency: CURRENCY_TYPE.USDC,
      premiumSum: ethers.utils.parseUnits('300', usdcDecimal),
      premiumCurrency: CURRENCY_TYPE.USDC,
      holder: holder1.address,
      insuredSumRule: INSURED_RULE.PARTIAL,
    };
    await createCoverRequest(data, holder1);
  });

  it('Funder 1 Provide Funding on first request', async () => {
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

  it('Time travel to expired time of fourth request', async () => {
    const fourthRequestId = 3;
    const listingExpiredAt = parseInt(
      (await ld.getCoverRequestById(fourthRequestId)).expiredAt.toString(),
      0
    );
    // Time travel to expired time of fourth request
    await network.provider.send('evm_setNextBlockTimestamp', [
      listingExpiredAt,
    ]);
    await network.provider.send('evm_mine');
  });

  it('Collectively refund premium', async () => {
    // Token before Collective refund premium
    const usdtBalanceBefore = await usdtToken.balanceOf(holder1.address);
    const usdcBalanceBefore = await usdcToken.balanceOf(holder1.address);
    const daiBalanceBefore = await daiToken.balanceOf(holder1.address);

    await collectiveClaimGateway.connect(holder1).collectiveRefundPremium();

    // Token before Collective refund premium
    const usdtBalanceAfter = await usdtToken.balanceOf(holder1.address);
    const usdcBalanceAfter = await usdcToken.balanceOf(holder1.address);
    const daiBalanceAfter = await daiToken.balanceOf(holder1.address);

    expect(usdtBalanceAfter.sub(usdtBalanceBefore)).to.eq(
      ethers.utils.parseUnits('500', usdtDecimal)
    );
    expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.eq(
      ethers.utils.parseUnits('300', usdcDecimal)
    );
    expect(daiBalanceAfter.sub(daiBalanceBefore)).to.eq(
      ethers.utils.parseUnits('300', daiDecimal)
    );
  });
});
