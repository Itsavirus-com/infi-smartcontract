import {
  CoverGateway,
  DaiToken,
  Encode,
  ListingData,
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
} from '../utils/calculationUtils';
import { CURRENCY_TYPE, EMPTY_PERMIT_BYTES } from '../utils/constants';
import { createCoverOffer } from '../utils/createOfferUtils';
import { getContract } from '../utils/deployments';
import {
  BuyCover,
  CoinPricingInfoUnsigned,
  CoverOffer,
  EIP2612Permit,
  SignerWithAddress,
} from '../utils/interfaces';
import { encodePermit } from '../utils/paramUtils';
import {
  signCoinPricingInfo,
  signPermitUSDC,
} from '../utils/signTypedDataUtils';

const { expect } = chai;

/**
 * Make tests that includes scenario : not ideal coin price (above 1 USD)
 */

describe('Take Offer', () => {
  let devWallet: SignerWithAddress;
  let coinSigner: SignerWithAddress;
  let holder1: SignerWithAddress;
  let funder1: SignerWithAddress;
  let usdcToken: UsdcToken;
  let usdtToken: UsdtToken;
  let encode: Encode;
  let listingData: ListingData;
  let pl: Pool;
  let cg: CoverGateway;

  // Set Coin Price
  const dataCoinUSDCtoUSDT: CoinPricingInfoUnsigned = {
    coinId: 'usdt',
    coinSymbol: 'USDT',
    lastUpdatedAt: 1622604081,
    coinPrice: ethers.utils.parseUnits('1.1', 6), // NOT IDEAL COIN PRICE, ABOVE 1 USD
  };

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

      funder1,
      coinSigner,
      devWallet,
    } = await ethers.getNamedSigners());

    // Get external contracts
    usdcToken = await getContract<UsdcToken>('USDC');
    usdtToken = await getContract<UsdtToken>('USDT');

    // Deploy and Set Up Contract
    encode = await getContract<Encode>('Encode');
    pl = await getContract<Pool>('Pool');
    cg = await getContract<CoverGateway>('CoverGateway');
    listingData = await getContract<ListingData>('ListingData');
  });

  /**
   * Create Offer
   * Full Uptake
   * scenario :

   */
  it('Create Offer Cover 1 - cover qty USDT x Premium & Insured Sum USDC', async () => {
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
    const coverQtyInUnit = ethers.utils.parseUnits('1100', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinUSDCtoUSDT.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    // Get current block
    const blockNow = (await ethers.provider.getBlock('latest')).timestamp;

    // Expect correct total premium
    const totalPremium = calculatePremium(
      coverQtyInUnit,
      ethers.BigNumber.from('10000'), // based on offer
      1
    );

    // Permit Data
    const nonce = await usdcToken.nonces(holder1.address);
    const signPermitUSDCData: EIP2612Permit = await signPermitUSDC(
      holder1, // owner
      pl.address, // spender
      nonce.toNumber(), // nonce
      ethers.BigNumber.from(totalPremium), //
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

    // Check token transfered
    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );

    // Check insured sum taken
    const getInsuredSumTaken = await listingData.offerIdToInsuredSumTaken(
      dataBuyCover.offerId
    );
    expect(getInsuredSumTaken).to.be.eq(insuredSumInUnit);
  });

  it('Failed Take Offer 1 with USDC, wrong permit amount', async () => {
    const insuredSumDecimal = 6;
    const coverQtyDecimal = 18;

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('1100', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinUSDCtoUSDT.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice

    // Get current block
    const blockNow = (await ethers.provider.getBlock('latest')).timestamp;

    // Expect correct total premium
    const totalPremium = calculatePremium(
      coverQtyInUnit,
      ethers.BigNumber.from('10000'), // based on offer
      1
    );

    // Permit Data
    const nonce = await usdcToken.nonces(holder1.address);
    const signPermitUSDCData: EIP2612Permit = await signPermitUSDC(
      holder1, // owner
      pl.address, // spender
      nonce.toNumber(), // nonce
      ethers.BigNumber.from(totalPremium).sub(1), // MAKE PROBLEM HERE, smaller amount of premium tha must be pay
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

    // Expect to be reverted because amount of premium that send via permit is insufficient
    await expect(cg.connect(holder1).buyCover(dataBuyCover)).to.be.revertedWith(
      'ERC20: transfer amount exceeds allowance'
    );
  });

  it('Create Offer Cover 2 - cover qty USDC x Premium & Insured Sum USDT', async () => {
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

  it('Take Offer 2 with USDT', async () => {
    const insuredSumDecimal = 6;
    const coverQtyDecimal = 18;

    // Get Token Balance
    const devWalletBefore = await usdtToken.balanceOf(devWallet.address);
    const funderWalletBefore = await usdtToken.balanceOf(funder1.address);

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('1000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinUSDCtoUSDT.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice
    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: 1,
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

    // Expect correct total premium
    const totalPremium = calculatePremium(
      coverQtyInUnit,
      ethers.utils.parseUnits('0.01', 6), // based on offer
      1
    );

    await usdtToken.connect(holder1).approve(pl.address, totalPremium);
    await cg.connect(holder1).buyCover(dataBuyCover);

    // Get Token Balance
    const devWalletAfter = await usdtToken.balanceOf(devWallet.address);
    const funderWalletAfter = await usdtToken.balanceOf(funder1.address);

    // Expect correct total premium
    expect(devWalletBefore.add(funderWalletBefore)).to.be.eq(
      devWalletAfter.add(funderWalletAfter).sub(totalPremium)
    );

    // Check insured sum taken
    const getInsuredSumTaken = await listingData.offerIdToInsuredSumTaken(
      dataBuyCover.offerId
    );
    expect(getInsuredSumTaken).to.be.eq(insuredSumInUnit);
  });

  it('Failed Take Offer 2 with USDT - insufficient amount of premium', async () => {
    const insuredSumDecimal = 6;
    const coverQtyDecimal = 18;

    // Calculate Insured Sum
    const coverQtyInUnit = ethers.utils.parseUnits('1000', coverQtyDecimal);
    const insuredSumInUnit = coverQtyInUnit
      .mul(dataCoinUSDCtoUSDT.coinPrice)
      .mul(ethers.utils.parseUnits('1', insuredSumDecimal)) // multiple by insured sum base currency
      .div(ethers.utils.parseUnits('1', coverQtyDecimal)) // divide by decimals of cover qty
      .div(ethers.utils.parseUnits('1', 6)); // divide by decimals of coinPrice
    // Transaction Data
    const dataBuyCover: BuyCover = {
      offerId: 1,
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

    // Expect correct total premium
    const totalPremium = calculatePremium(
      coverQtyInUnit,
      ethers.utils.parseUnits('0.01', 6), // based on offer
      1
    );

    await usdtToken
      .connect(holder1)
      .approve(pl.address, ethers.BigNumber.from(totalPremium).sub(1)); // MAKE PROBLEM HERE, make insufficient amount of premium to be approved

    // Expect to be reverted because amount of premium that send via permit is insufficient
    await expect(cg.connect(holder1).buyCover(dataBuyCover)).to.be.revertedWith(
      'ERC20: transfer amount exceeds allowance'
    );
  });
});
