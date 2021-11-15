import { parseUnits } from '@ethersproject/units';
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
  UsdcToken,
  UsdtToken,
} from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';

import {
  calculateDayInUnix,
  calculateNextMonthInUnix,
  calculatePremium,
  getNowUnix,
} from './utils/calculationUtils';
import {
  CURRENCY_TYPE,
  dataCoinUSDCtoUSDT,
  dataCoinUSDTtoDAI,
  dataCoinUSDTtoUSDC,
  EMPTY_PERMIT_BYTES,
} from './utils/constants';
import { createCoverOffer } from './utils/createOfferUtils';
import { getContract } from './utils/deployments';
import {
  BuyCover,
  CoinPricingInfoUnsigned,
  CoverOffer,
  DAIPermit,
  EIP2612Permit,
  SignerWithAddress,
} from './utils/interfaces';
import { setUpMockKeepers } from './utils/keepersUtils';
import { encodeParam, encodePermit } from './utils/paramUtils';
import {
  signCoinPricingInfo,
  signPermitDai,
  signPermitUSDC,
} from './utils/signTypedDataUtils';

const { expect } = chai;

describe('Take Offer', () => {
  let devWallet: SignerWithAddress;
  let coinSigner: SignerWithAddress;
  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let funder1: SignerWithAddress;
  let infiToken: InfiToken;
  let daiToken: DaiToken | UChildDAI;
  let usdcToken: UsdcToken;
  let usdtToken: UsdtToken;
  let encode: Encode;
  let pl: Pool;
  let cd: CoverData;
  let cg: CoverGateway;
  let claimData: ClaimData;
  let claimGateway: ClaimGateway;
  let daiDecimal: number;
  let usdcDecimal: number;
  const dummyRoundId = '18446744073709555607';

  const getNonceDAI = (address: string) =>
    (daiToken as UChildDAI).getNonce
      ? (daiToken as UChildDAI).getNonce(address)
      : (daiToken as DaiToken).nonces(address);

  // Template
  const offerDataTemplate: CoverOffer = {
    minCoverMonths: 1,
    insuredSum: ethers.utils.parseUnits('4122', 6),
    insuredSumCurrency: CURRENCY_TYPE.USDC,
    premiumCostPerMonth: ethers.BigNumber.from('10000'),
    premiumCurrency: CURRENCY_TYPE.USDC,
    expiredAt: calculateNextMonthInUnix(1),
    coinId: 'tether',
    coverLimit: {
      coverType: 1,
      territoryIds: [0],
    },
    insuredSumRule: 0,
    funder: '',
  };

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
    usdcToken = await getContract<UsdcToken>('USDC');
    usdtToken = await getContract<UsdtToken>('USDT');
    usdcDecimal = await usdcToken.decimals();

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

   */
  it('Create Offer Cover 1 - Insured Sum USDT x Premium USDC', async () => {
    const offerData: CoverOffer = {
      ...offerDataTemplate,
      premiumCostPerMonth: ethers.BigNumber.from('10000'), // Premium Cost Per Month 1 USDT : 0.01 USDC
      funder: funder1.address,
    };
    await createCoverOffer(offerData, funder1);
  });

  it('Take Offer 1 with USDC', async () => {
    const insuredSumDecimal = 6;
    const coverQtyDecimal = 18;

    // Get Token Balance
    const devWalletBefore = await usdcToken.balanceOf(devWallet.address);
    const funderWalletBefore = await usdcToken.balanceOf(funder1.address);

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('4122', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinUSDCtoUSDT.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    console.log('insuredSumInUnit : ', insuredSumInUnit.toString());
    console.log('coverQtyInUnit : ', coverQtyInUnit.toString());
    console.log(
      'dataCoinUSDCtoUSDT.coinPrice : ',
      dataCoinUSDCtoUSDT.coinPrice
    );

    // Get current block
    const blockNow = (await ethers.provider.getBlock('latest')).timestamp;

    // Permit Data
    const nonce = await usdcToken.nonces(holder1.address);
    const signPermitUSDCData: EIP2612Permit = await signPermitUSDC(
      holder1, // owner
      pl.address, // spender
      nonce.toNumber(), // nonce
      ethers.utils.parseUnits('5000', usdcDecimal), // amount
      blockNow + calculateDayInUnix(1) // deadline 1 day expired
    );
    const permitDataBytes: string = encodePermit(
      CURRENCY_TYPE.USDC,
      signPermitUSDCData,
      encode
    );

    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: 0,
      buyer: holder1.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinUSDCtoUSDT,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: permitDataBytes,
    };
    await cg.connect(holder1).buyCover(dataBuyCover);

    // Get Token Balance
    const devWalletAfter = await usdcToken.balanceOf(devWallet.address);
    const funderWalletAfter = await usdcToken.balanceOf(funder1.address);

    // Expect correct total premium
    const totalPremium = coverQtyInUnit
      .mul(ethers.utils.parseUnits('0.01', insuredSumDecimal)) // Premium Cost Per Month 1 USDT : 0.01 USDC
      .mul(1) // cover months
      .div(ethers.utils.parseUnits('1', coverQtyDecimal));

    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );
  });

  it('Create Offer Cover 2 - Insured Sum USDT x Premium DAI', async () => {
    const offerData: CoverOffer = {
      ...offerDataTemplate,
      funder: funder1.address,
      minCoverMonths: 1,
      insuredSum: ethers.utils.parseUnits('4122', 18),
      insuredSumCurrency: CURRENCY_TYPE.DAI,
      premiumCostPerMonth: ethers.utils.parseUnits('0.01', 18), // Premium Cost Per Month 1 USDT : 0.01 DAI
      premiumCurrency: CURRENCY_TYPE.DAI,
      expiredAt: calculateNextMonthInUnix(1),
      coinId: 'tether',
      coverLimit: {
        coverType: 1,
        territoryIds: [0],
      },
      insuredSumRule: 0,
    };
    await createCoverOffer(offerData, funder1);
  });

  it('Take Offer 2 with DAI', async () => {
    const insuredSumDecimal = 18;
    const coverQtyDecimal = 18;

    // Get Token Balance
    const devWalletBefore = await daiToken.balanceOf(devWallet.address);
    const funderWalletBefore = await daiToken.balanceOf(funder1.address);

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('4122', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinUSDCtoUSDT.coinPrice)
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
      offerId: 1,
      buyer: holder1.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinUSDTtoDAI,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: permitDataBytes,
    };
    await cg.connect(holder1).buyCover(dataBuyCover);

    // Get Token Balance
    const devWalletAfter = await daiToken.balanceOf(devWallet.address);
    const funderWalletAfter = await daiToken.balanceOf(funder1.address);

    // Expect correct total premium
    const totalPremium = coverQtyInUnit
      .mul(ethers.utils.parseUnits('0.01', insuredSumDecimal)) // Premium Cost Per Month 1 USDT : 0.01 DAI
      .mul(1) // cover months
      .div(ethers.utils.parseUnits('1', coverQtyDecimal));

    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );
  });

  it('Create Offer Cover 3 - Insured Sum USDC x Premium USDT', async () => {
    const offerData: CoverOffer = {
      ...offerDataTemplate,
      funder: funder1.address,
      minCoverMonths: 1,
      insuredSum: ethers.utils.parseUnits('4122', 6),
      insuredSumCurrency: CURRENCY_TYPE.USDT,
      premiumCostPerMonth: ethers.utils.parseUnits('0.01', 6), // Premium Cost Per Month 1 USDT : 0.01 DAI
      premiumCurrency: CURRENCY_TYPE.USDT,
      expiredAt: calculateNextMonthInUnix(1),
      coinId: 'usd-coin',
      coverLimit: {
        coverType: 1,
        territoryIds: [0],
      },
      insuredSumRule: 0,
    };
    await createCoverOffer(offerData, funder1);
  });

  it('Take Offer 3 with USDT', async () => {
    const insuredSumDecimal = 6;
    const coverQtyDecimal = 18;

    // Get Token Balance
    const devWalletBefore = await usdtToken.balanceOf(devWallet.address);
    const funderWalletBefore = await usdtToken.balanceOf(funder1.address);

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('4122', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinUSDCtoUSDT.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice
    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: 2,
      buyer: holder1.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinUSDCtoUSDT,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: EMPTY_PERMIT_BYTES,
    };

    // Calculate Total Premium
    const totalPremium = coverQtyInUnit
      .mul(ethers.utils.parseUnits('0.01', insuredSumDecimal)) // Premium Cost Per Month 1 USDC : 0.01 USDT
      .mul(1) // cover months
      .div(ethers.utils.parseUnits('1', coverQtyDecimal));

    await usdtToken.connect(holder1).approve(pl.address, totalPremium);
    await cg.connect(holder1).buyCover(dataBuyCover);

    // Get Token Balance
    const devWalletAfter = await usdtToken.balanceOf(devWallet.address);
    const funderWalletAfter = await usdtToken.balanceOf(funder1.address);

    // Expect correct total premium
    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );
  });

  it('Create Offer Cover 4 - Take - Fail because Wrong Cover Qty format ', async () => {
    const offerData: CoverOffer = {
      ...offerDataTemplate,
      funder: funder1.address,
      minCoverMonths: 1,
      insuredSum: ethers.utils.parseUnits('4122', 6),
      insuredSumCurrency: CURRENCY_TYPE.USDT,
      premiumCostPerMonth: ethers.utils.parseUnits('0.01', 6), // Premium Cost Per Month 1 USDT : 0.01 DAI
      premiumCurrency: CURRENCY_TYPE.USDT,
      expiredAt: calculateNextMonthInUnix(1),
      coinId: 'usd-coin',
      coverLimit: {
        coverType: 1,
        territoryIds: [0],
      },
      insuredSumRule: 0,
    };
    await createCoverOffer(offerData, funder1);

    // TAKE OFFER
    const insuredSumDecimal = 6;
    const coverQtyDecimal = 6; // Make cover qty smaller than the requirements

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('4122', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinUSDCtoUSDT.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice
    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: 3,
      buyer: holder1.address,
      coverMonths: 1,
      coverQty: coverQtyInUnit,
      insuredSum: insuredSumInUnit,
      assetPricing: await signCoinPricingInfo(
        dataCoinUSDCtoUSDT,
        coinSigner,
        pl.address // verify by Cover Gateway Contract
      ),
      premiumPermit: EMPTY_PERMIT_BYTES,
    };

    // Calculate Total Premium
    const totalPremium = coverQtyInUnit
      .mul(ethers.utils.parseUnits('0.01', insuredSumDecimal)) // Premium Cost Per Month 1 USDC : 0.01 USDT
      .mul(1) // cover months
      .div(ethers.utils.parseUnits('1', coverQtyDecimal));

    // Send token USDT
    await usdtToken.connect(holder1).approve(pl.address, totalPremium);
    // Make transaction and expected tobe reverted because Wrong Cover Qty format
    await expect(cg.connect(holder1).buyCover(dataBuyCover)).to.be.revertedWith(
      'ERR_CLG_28'
    );
  });
});
