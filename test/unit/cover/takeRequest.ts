import {
  ClaimData,
  ClaimGateway,
  CollectiveClaimGateway,
  CoverData,
  CoverGateway,
  Encode,
  InfiToken,
  ListingData,
  ListingGateway,
  Pool,
  UsdtToken,
} from '@project/contracts/typechain';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { BigNumber } from 'ethers';
import { deployments, ethers, network } from 'hardhat';

import {
  calculateDayInUnix,
  calculateListingFee,
  getNowUnix,
} from '../utils/calculationUtils';
import {
  CURRENCY_TYPE,
  EMPTY_PERMIT_BYTES,
  INSURED_RULE,
} from '../utils/constants';
import { createCoverRequest } from '../utils/createRequestUtils';
import { getContract } from '../utils/deployments';
import {
  CoinPricingInfoUnsigned,
  CoverRequest,
  ProvideCover,
  RequestData,
  SignerWithAddress,
} from '../utils/interfaces';
import { setUpMockKeepers } from '../utils/keepersUtils';
import { signCoinPricingInfo } from '../utils/signTypedDataUtils';

chai.use(chaiAsPromised);
const { expect } = chai;

// Template
const coverRequestData: CoverRequest = {
  coverQty: 100,
  coverMonths: 3,
  insuredSum: ethers.utils.parseUnits('1729'),
  insuredSumTarget: ethers.utils.parseUnits('1729'),
  insuredSumCurrency: CURRENCY_TYPE.USDT,
  premiumSum: ethers.utils.parseUnits('249.9999979'),
  premiumCurrency: CURRENCY_TYPE.USDT,
  expiredAt: 1634152440 + calculateDayInUnix(10),
  coinId: 'dai',
  coverLimit: {
    coverType: 0,
    territoryIds: [0, 1],
  },
  insuredSumRule: INSURED_RULE.FULL, // full
  holder: '',
};

const dataCoinInfi: CoinPricingInfoUnsigned = {
  coinId: 'insured-finance',
  coinSymbol: 'infi',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('0.054583', 6),
};

const dataCoinUSDT: CoinPricingInfoUnsigned = {
  coinId: 'tether',
  coinSymbol: 'usdt',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};

describe('Take Request', () => {
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
  let listingGateway: ListingGateway;
  let usdtToken: UsdtToken;
  let usdtDecimal: number;
  const dummyRoundId = '18446744073709555607';

  let requestCoverId: number;
  let coverId: number;

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
    listingGateway = await getContract<ListingGateway>('ListingGateway');

    usdtDecimal = parseInt((await usdtToken.decimals()).toString(), 0);
  });

  /**
   * Scenario
   * 1. Create Request Cover Full Funding (Request COver 1729 USDT)
   * 2. Take Request (Cover 1000 USDT) - Success
   * 3. Take Request (Cover 1000 USDT) - Fail : Insufficient Remaining Sum
   * 4. Take Request (Cover 727 USDT) - Success - Hit Insured Sum Target Start Cover
   */
  describe('Take Request on Full Funding Request', () => {
    before(() => {
      requestCoverId = 0;
    });

    it('Create Request Cover 1 - Full Funding - USDT', async () => {
      // Pre-process
      const memberTokenBefore = await infiToken.balanceOf(holder1.address);
      const poolTokenBefore = await infiToken.balanceOf(pl.address);
      const devTokenBefore = await infiToken.balanceOf(devWallet.address);
      const poolUsdtTokenBefore = await usdtToken.balanceOf(pl.address);

      // Process
      const data: RequestData = {
        ...coverRequestData,
        insuredSum: ethers.utils.parseUnits('1729', usdtDecimal),
        insuredSumTarget: ethers.utils.parseUnits('1727', usdtDecimal), // tolerance 2 token
        insuredSumCurrency: CURRENCY_TYPE.USDT,
        premiumSum: ethers.utils.parseUnits('249.999979', usdtDecimal),
        premiumCurrency: CURRENCY_TYPE.USDT,
        holder: holder1.address,
      };
      await createCoverRequest(data, holder1);

      // Get Latest price
      const coinLatestPrice = await listingGateway.getChainlinkPrice(
        data.insuredSumCurrency
      );
      const feePricing = await signCoinPricingInfo(
        dataCoinInfi,
        coinSigner,
        pl.address
      );
      const infiTokenTransfered = calculateListingFee(
        data.insuredSum,
        usdtDecimal,
        feePricing.coinPrice,
        coinLatestPrice.decimals,
        coinLatestPrice.price
      );
      let devFee;
      if (BigNumber.from(infiTokenTransfered).mod(2).eq(1)) {
        devFee = BigNumber.from(infiTokenTransfered).div(2).add(1);
      } else {
        devFee = infiTokenTransfered.div(2);
      }

      // Expect Data
      const memberTokenAfter = await infiToken.balanceOf(holder1.address);
      const poolTokenAfter = await infiToken.balanceOf(pl.address);
      const poolUsdtTokenAfter = await usdtToken.balanceOf(pl.address);
      const storedData = await ld.getCoverRequestById(requestCoverId);
      expect(storedData.insuredSum).to.eq(data.insuredSum);
      expect(storedData.coverMonths).to.eq(data.coverMonths);
      expect(storedData.insuredSum).to.eq(data.insuredSum);
      expect(storedData.insuredSumTarget).to.eq(data.insuredSumTarget);
      expect(storedData.insuredSumCurrency).to.eq(data.insuredSumCurrency);
      expect(storedData.premiumSum).to.eq(data.premiumSum);
      expect(storedData.premiumCurrency).to.eq(data.premiumCurrency);
      // expect(storedData.expiredAt).to.eq(data.request.expiredAt);
      expect(storedData.coinId).to.eq(data.coinId);
      expect(storedData.coverLimit.coverType).to.eq(data.coverLimit.coverType);
      expect(storedData.coverLimit.territoryIds).to.have.lengthOf(
        data.coverLimit.territoryIds.length
      );
      expect(memberTokenAfter).to.eq(
        memberTokenBefore.sub(infiTokenTransfered)
      );
      expect(poolTokenAfter).to.eq(poolTokenBefore);
      expect(await infiToken.balanceOf(devWallet.address)).to.eq(
        devTokenBefore.add(devFee)
      );
      expect(poolUsdtTokenAfter).to.eq(
        poolUsdtTokenBefore.add(data.premiumSum)
      );
    });

    it('Take Request on Request Cover 1 - Success', async () => {
      const provideCoverData: ProvideCover = {
        requestId: requestCoverId,
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

      // Get Booking
      const bookingData = await cd.getBookingById(0);
      // console.log('Booking Data : ', bookingData);
      expect(provideCoverData.requestId).to.eq(bookingData.requestId);
      expect(provideCoverData.provider).to.eq(bookingData.funder);
      expect(provideCoverData.fundingSum).to.eq(bookingData.fundingSum);

      // Get Insurance Data
      // eslint-disable-next-line
      const coverId = 0;
      const coverData = await cd.getCoverById(coverId);
      const coverStartAt = await cg.getStartAt(coverId);
      expect(coverData.requestId).to.eq(requestCoverId);
      expect(coverData.holder).to.eq(holder1.address);
      expect(coverData.insuredSum).to.eq(provideCoverData.fundingSum);
      const coverQty = ethers.BigNumber.from(provideCoverData.fundingSum)
        .div(provideCoverData.assetPricing.coinPrice)
        .mul(BigNumber.from(10 ** 12));
      expect(coverData.coverQty).to.eq(coverQty);
      expect(coverStartAt).to.eq(0);

      // Check getEndAt function
      const coverRequest = await ld.getCoverRequestById(requestCoverId);
      const monthInUnix = calculateDayInUnix(30);
      const coverMonthsInUnix = ethers.BigNumber.from(
        coverRequest.coverMonths
      ).mul(monthInUnix);
      const endAtActual = coverStartAt.add(coverMonthsInUnix);
      const endAtByFunction = await cg.getEndAt(coverId);
      expect(endAtActual).to.eq(endAtByFunction);
    });

    it('Take Request on Request Cover 1 -  Remaining insured sum is insufficient', async () => {
      const provideCoverData: ProvideCover = {
        requestId: requestCoverId,
        provider: funder2.address,
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
        .connect(funder2)
        .approve(pl.address, provideCoverData.fundingSum);
      await expect(
        cg.connect(funder2).provideCover(provideCoverData)
      ).to.be.revertedWith('ERR_CG_4');
    });

    it('Take Request on Request Cover 1 - Start Cover Insurance', async () => {
      const provideCoverData: ProvideCover = {
        requestId: requestCoverId,
        provider: funder1.address,
        fundingSum: ethers.utils.parseUnits('727', usdtDecimal),
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

      // Get Booking
      const bookingData = await cd.getBookingById(1);
      expect(provideCoverData.requestId).to.eq(bookingData.requestId);
      expect(provideCoverData.provider).to.eq(bookingData.funder);
      expect(provideCoverData.fundingSum).to.eq(bookingData.fundingSum);

      // Get Insurance Data index 0 , startAt != 0 means insurance started
      const cover0StartAt = await cg.getStartAt(0);
      expect(cover0StartAt).to.not.eq('0');

      // Get Insurance Data index 1 , startAt != 0 means insurance started
      const coverData1 = await cd.getCoverById(1);
      const cover1StartAt = await cg.getStartAt(1);
      expect(coverData1.requestId).to.eq(requestCoverId);
      expect(coverData1.holder).to.eq(holder1.address);
      const coverQty = ethers.BigNumber.from(provideCoverData.fundingSum)
        .div(provideCoverData.assetPricing.coinPrice)
        .mul(BigNumber.from(10 ** 12));
      expect(coverData1.coverQty).to.eq(coverQty);
      expect(cover1StartAt).to.not.eq(0);
    });

    it('Claim Cover - Valid', async () => {
      // Set Mockup Keepers
      await setUpMockKeepers([dummyRoundId], 1634293692, {
        past: 740000,
        current: 740000,
        next: 740000,
      });

      // Time Travel to passing monitoring period
      await network.provider.send('evm_setNextBlockTimestamp', [1634556592]);
      await network.provider.send('evm_mine');

      // eslint-disable-next-line
      const coverRequestId = 0;
      await expect(
        collectiveClaimGateway
          .connect(holder1)
          .collectiveSubmitClaim(coverRequestId, dummyRoundId)
      ).to.emit(collectiveClaimGateway, 'ValidCollectiveClaim');
    });
  });

  /**
   * Scenario
   * 1. Create Request Cover - Partial Funding (Request Cover 1729 USDT)
   * 2. Provide 25% of Request Cover
   * 3. Claim Cover Failed
   * 4. Time travel & Claim Cover Succeed
   */
  describe('Take Request on Partial Funding Request', () => {
    before(() => {
      requestCoverId = 1;
      coverId = 2;
    });

    it('Create Request Cover - Partial Funding (Request Cover 1729 USDT)', async () => {
      // Pre-process
      const memberTokenBefore = await infiToken.balanceOf(holder1.address);
      const poolTokenBefore = await infiToken.balanceOf(pl.address);
      const devTokenBefore = await infiToken.balanceOf(devWallet.address);
      const poolUsdtTokenBefore = await usdtToken.balanceOf(pl.address);

      // Process
      const data: RequestData = {
        ...coverRequestData,
        insuredSum: ethers.utils.parseUnits('1729', usdtDecimal),
        insuredSumTarget: ethers.utils.parseUnits('1729', usdtDecimal).div(4), // target is 25 %
        insuredSumCurrency: CURRENCY_TYPE.USDT,
        premiumSum: ethers.utils.parseUnits('249.999979', usdtDecimal),
        premiumCurrency: CURRENCY_TYPE.USDT,
        holder: holder1.address,
        insuredSumRule: INSURED_RULE.PARTIAL,
      };
      await createCoverRequest(data, holder1);

      // Get Latest price
      const coinLatestPrice = await listingGateway.getChainlinkPrice(
        data.insuredSumCurrency
      );
      const feePricing = await signCoinPricingInfo(
        dataCoinInfi,
        coinSigner,
        pl.address
      );
      const infiTokenTransfered = calculateListingFee(
        data.insuredSum,
        usdtDecimal,
        feePricing.coinPrice,
        coinLatestPrice.decimals,
        coinLatestPrice.price
      );
      let devFee;
      if (BigNumber.from(infiTokenTransfered).mod(2).eq(1)) {
        devFee = BigNumber.from(infiTokenTransfered).div(2).add(1);
      } else {
        devFee = infiTokenTransfered.div(2);
      }

      // Expect Data
      const memberTokenAfter = await infiToken.balanceOf(holder1.address);
      const poolTokenAfter = await infiToken.balanceOf(pl.address);
      const poolUsdtTokenAfter = await usdtToken.balanceOf(pl.address);
      const storedData = await ld.getCoverRequestById(requestCoverId);
      expect(storedData.insuredSum).to.eq(data.insuredSum);
      expect(storedData.coverMonths).to.eq(data.coverMonths);
      expect(storedData.insuredSum).to.eq(data.insuredSum);
      expect(storedData.insuredSumTarget).to.eq(data.insuredSumTarget);
      expect(storedData.insuredSumCurrency).to.eq(data.insuredSumCurrency);
      expect(storedData.premiumSum).to.eq(data.premiumSum);
      expect(storedData.premiumCurrency).to.eq(data.premiumCurrency);
      // expect(storedData.expiredAt).to.eq(data.request.expiredAt);
      expect(storedData.coinId).to.eq(data.coinId);
      expect(storedData.coverLimit.coverType).to.eq(data.coverLimit.coverType);
      expect(storedData.coverLimit.territoryIds).to.have.lengthOf(
        data.coverLimit.territoryIds.length
      );
      expect(memberTokenAfter).to.eq(
        memberTokenBefore.sub(infiTokenTransfered)
      );
      expect(poolTokenAfter).to.eq(poolTokenBefore);
      expect(await infiToken.balanceOf(devWallet.address)).to.eq(
        devTokenBefore.add(devFee)
      );
      expect(poolUsdtTokenAfter).to.eq(
        poolUsdtTokenBefore.add(data.premiumSum)
      );
    });

    it('Fail to Provide 25% of Request Cover', async () => {
      // Set Mockup Keepers
      await setUpMockKeepers([dummyRoundId], 1636957684, {
        past: 1000000,
        current: 1000000,
        next: 1000000,
      });

      const provideCoverData: ProvideCover = {
        requestId: requestCoverId,
        provider: funder1.address,
        fundingSum: ethers.utils.parseUnits('432.25', usdtDecimal), // Buy 25% of Request
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
      await expect(
        cg.connect(funder1).provideCover(provideCoverData)
      ).to.be.revertedWith('ERR_CG_8');
    });

    it('Provide 75% of Request Cover', async () => {
      // Set Mockup Keepers
      await setUpMockKeepers([dummyRoundId], 1636957684, {
        past: 1000000,
        current: 1000000,
        next: 1000000,
      });

      const provideCoverData: ProvideCover = {
        requestId: requestCoverId,
        provider: funder1.address,
        fundingSum: ethers.utils.parseUnits('1296.75', usdtDecimal), // Buy 25% of Request
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

      // Get Booking
      const bookingData = await cd.getBookingById(coverId);
      // console.log('Booking Data : ', bookingData);
      expect(provideCoverData.requestId).to.eq(bookingData.requestId);
      expect(provideCoverData.provider).to.eq(bookingData.funder);
      expect(provideCoverData.fundingSum).to.eq(bookingData.fundingSum);

      // Get Insurance Data
      const coverData = await cd.getCoverById(coverId);
      const coverStartAt = await cg.getStartAt(coverId);
      expect(coverData.requestId).to.eq(requestCoverId);
      expect(coverData.holder).to.eq(holder1.address);
      expect(coverData.insuredSum).to.eq(provideCoverData.fundingSum);
      const coverQty = ethers.BigNumber.from(provideCoverData.fundingSum)
        .mul(BigNumber.from(10 ** 12))
        .div(provideCoverData.assetPricing.coinPrice);
      console.log(
        'Funding Sum : ',
        ethers.BigNumber.from(provideCoverData.fundingSum).toString()
      );
      console.log(
        'Coin Price : ',
        provideCoverData.assetPricing.coinPrice.toString()
      );
      console.log('Base : ', BigNumber.from(10 ** 12).toString());

      expect(coverData.coverQty).to.eq(coverQty);
      expect(coverStartAt).to.eq(0);
    });

    it('Claim Cover Failed', async () => {
      await expect(
        claimGateway.connect(holder1).submitClaim(coverId, dummyRoundId)
      ).to.be.revertedWith('ERR_CLG_');
    });

    it('Time travel & Claim Cover Succeed', async () => {
      // Set Mockup Keepers
      await setUpMockKeepers([dummyRoundId], 1636957684, {
        past: 740000,
        current: 740000,
        next: 740000,
      });

      // Get Cover Request Data
      const coverRequest = await ld.getCoverRequestById(requestCoverId);
      const coverRequestExpiredAt = coverRequest.expiredAt;
      const { coverMonths } = coverRequest;
      const monthInUnix = calculateDayInUnix(30);
      const coverMonthsInUnix = ethers.BigNumber.from(coverMonths).mul(
        monthInUnix
      );

      // Time travel
      await network.provider.send('evm_setNextBlockTimestamp', [
        coverRequestExpiredAt.add(1).toNumber(),
      ]);
      await network.provider.send('evm_mine');

      // Check cover start
      const coverStartAt = await cg.getStartAt(coverId);
      const coverEndAt = await cg.getEndAt(coverId);
      expect(coverStartAt).to.eq(coverRequestExpiredAt);
      expect(coverEndAt).to.eq(coverRequestExpiredAt.add(coverMonthsInUnix));

      await expect(
        collectiveClaimGateway
          .connect(holder1)
          .collectiveSubmitClaim(requestCoverId, dummyRoundId)
      ).to.emit(claimData, 'CollectiveClaimRaise');
    });
  });
});
