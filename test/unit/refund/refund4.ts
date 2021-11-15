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
  - Funder 1 Create Offer Cover with USDT as collateral
  - Holder 1 Buy offer
  - Holder 1 Make success first claim over
  - Holder 1 Make success second, third , and fourth claim over

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

  it('Holder 1 Make success first claim', async () => {
    // Time travel to pass monitoring period
    await network.provider.send('evm_setNextBlockTimestamp', [1634556592]);
    await network.provider.send('evm_mine');

    // Set Mockup Keepers
    await setUpMockKeepers([dummyRoundId], 1634293692, {
      past: 740000,
      current: 740000,
      next: 740000,
    });

    // With condition devaluation 26% from 1USD
    // asset price = 0.74 USD
    // balance before claim
    const balanceBeforeClaim = await usdtToken.balanceOf(holder2.address);

    // Make claim
    const coverId = 0;
    await claimGateway.connect(holder2).submitClaim(coverId, dummyRoundId);

    // balance after claim
    const balanceAfterClaim = await usdtToken.balanceOf(holder2.address);

    // Calculate devaluation
    const devaluation = ethers.utils.parseUnits('0.26', 6);
    const currentPrice = ethers.utils.parseUnits('1', 6).sub(devaluation);
    const payout = ethers.utils
      .parseUnits('1000', usdtDecimal)
      .mul(devaluation)
      .div(currentPrice);

    // Expect corrent payput
    expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(payout);
  });

  it('Holder 1 Make fail make claim to a claim that already valid', async () => {
    // Set Mockup Keepers
    await setUpMockKeepers([dummyRoundId], 1634293692, {
      past: 740000,
      current: 740000,
      next: 740000,
    });

    // With condition devaluation 26% from 1USD
    // asset price = 0.74 USD
    // balance before claim
    const coverId = 0;
    await expect(
      claimGateway.connect(holder2).submitClaim(coverId, dummyRoundId)
    ).to.be.revertedWith('ERR_CLG_4');
  });

  it('Holder 1 fail to make second, third, fourth claim', async () => {
    // Set Mockup Keepers
    await setUpMockKeepers(
      ['18446744073709555608', '18446744073709555609', '18446744073709555610'],
      1634293692,
      {
        past: 740000,
        current: 740000,
        next: 740000,
      }
    );

    // Make claim
    const coverId = 0;
    await expect(
      claimGateway.connect(holder2).submitClaim(coverId, '18446744073709555608')
    ).to.be.revertedWith('ERR_CLG_4');
    await expect(
      claimGateway.connect(holder2).submitClaim(coverId, '18446744073709555609')
    ).to.be.revertedWith('ERR_CLG_4');
    await expect(
      claimGateway.connect(holder2).submitClaim(coverId, '18446744073709555610')
    ).to.be.revertedWith('ERR_CLG_4');
  });

  it('Holder 1 fail to make fifth claim', async () => {
    // With condition devaluation 20% from 1USD
    // asset price = 0.8 USD
    // balance before claim

    // Make claim
    const coverId = 0;
    await expect(
      claimGateway.connect(holder2).submitClaim(coverId, dummyRoundId)
    ).to.be.reverted;
  });
});
