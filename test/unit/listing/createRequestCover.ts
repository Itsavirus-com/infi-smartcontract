import {
  DaiToken,
  Encode,
  InfiToken,
  ListingData,
  ListingGateway,
  Pool,
  UChildDAI,
  UChildUSDC,
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
  coverRequestData,
  CURRENCY_TYPE,
  dataCoinDai,
  dataCoinInfi,
  dataCoinUsdc,
  dataCoinUsdt,
  EMPTY_PERMIT_BYTES,
  PAY_TYPE,
} from '../utils/constants';
import { getContract } from '../utils/deployments';
import {
  CreateCoverRequestData,
  DAIPermit,
  EIP2612Permit,
  SignerWithAddress,
} from '../utils/interfaces';
import { encodeParam, encodePermit } from '../utils/paramUtils';
import {
  signCoinPricingInfo,
  signPermitDai,
  signPermitUSDC,
} from '../utils/signTypedDataUtils';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('Create Request Cover', () => {
  // Defined variable
  let holder1: SignerWithAddress;
  let devWallet: SignerWithAddress;
  let coinSigner: SignerWithAddress;
  let encode: Encode;
  let ld: ListingData;
  let listingGateway: ListingGateway;
  let pl: Pool;

  let infiToken: InfiToken;
  let daiToken: DaiToken | UChildDAI;
  let usdtToken: UsdtToken;
  let usdcToken: UChildUSDC;
  let usdcDecimal: number;
  let usdtDecimal: number;
  let daiDecimal: number;

  const getNonceDAI = (address: string) =>
    (daiToken as UChildDAI).getNonce
      ? (daiToken as UChildDAI).getNonce(address)
      : (daiToken as DaiToken).nonces(address);

  before(async () => {
    await deployments.fixture(['Config', 'Encode', 'MockBalances'], {
      keepExistingDeployments: true,
    });

    // Set time
    await network.provider.send('evm_setNextBlockTimestamp', [getNowUnix()]);

    ({ devWallet, holder1, coinSigner } = await ethers.getNamedSigners());

    // Get external contracts
    infiToken = await getContract<InfiToken>('INFI');
    daiToken = await getContract<DaiToken | UChildDAI>('DAI');
    usdtToken = await getContract<UsdtToken>('USDT');
    usdcToken = await getContract<UChildUSDC>('USDC');
    listingGateway = await getContract<ListingGateway>('ListingGateway');

    // Get fresh contract
    encode = await getContract<Encode>('Encode');
    ld = await getContract<ListingData>('ListingData');
    pl = await getContract<Pool>('Pool');

    usdcDecimal = await usdcToken.decimals();
    usdtDecimal = parseInt((await usdtToken.decimals()).toString(), 0);
    daiDecimal = await daiToken.decimals();
  });

  it('Validate verifyFeeAmount calculation', async () => {
    const coinLatestPrice = await listingGateway.getChainlinkPrice(
      CURRENCY_TYPE.USDT
    );
    const feePricing = await signCoinPricingInfo(
      dataCoinInfi,
      coinSigner,
      pl.address
    );
    const amountFromSmartContract = await pl.getListingFee(
      CURRENCY_TYPE.USDT,
      ethers.utils.parseUnits('1729', 6),
      feePricing.coinPrice,
      coinLatestPrice.roundId
    );
    const amountFromHelper = calculateListingFee(
      ethers.utils.parseUnits('1729', 6),
      6,
      ethers.utils.parseUnits('0.054583', 6),
      coinLatestPrice.decimals,
      coinLatestPrice.price
    );
    expect(amountFromSmartContract).to.eq(amountFromHelper);
  });

  it('Create Request Cover - DAI', async () => {
    // Pre-process
    const memberTokenBefore = await infiToken.balanceOf(holder1.address);
    const poolTokenBefore = await infiToken.balanceOf(pl.address);
    const devTokenBefore = await infiToken.balanceOf(devWallet.address);
    const poolDaiTokenBefore = await daiToken.balanceOf(pl.address);
    const requestCoverId = 0;
    // Permit Data
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

    const coinLatestPrice = await listingGateway.getChainlinkPrice(
      CURRENCY_TYPE.DAI
    );

    // Process
    const data: CreateCoverRequestData = {
      request: {
        ...coverRequestData,
        insuredSum: ethers.utils.parseUnits('1729', daiDecimal),
        insuredSumTarget: ethers.utils.parseUnits('1727', daiDecimal), // tolerance 2 token
        insuredSumCurrency: CURRENCY_TYPE.DAI,
        premiumSum: ethers.utils.parseUnits('249.9999979', daiDecimal),
        premiumCurrency: CURRENCY_TYPE.DAI,
        holder: holder1.address,
      },
      assetPricing: await signCoinPricingInfo(
        dataCoinDai,
        coinSigner,
        pl.address
      ), // verify by pool
      feePricing: await signCoinPricingInfo(
        dataCoinInfi,
        coinSigner,
        pl.address
      ), // verify by pool
      premiumPermit: permitDataBytes,
      roundId: coinLatestPrice.roundId,
    };

    const payloadInBytes = encodeParam(
      PAY_TYPE.CREATE_COVER_REQUEST,
      data,
      encode
    );
    const infiTokenTransfered = calculateListingFee(
      data.request.insuredSum,
      daiDecimal,
      data.feePricing.coinPrice,
      coinLatestPrice.decimals,
      coinLatestPrice.price
    );
    let devFee;
    if (BigNumber.from(infiTokenTransfered).mod(2).eq(1)) {
      devFee = BigNumber.from(infiTokenTransfered).div(2).add(1);
    } else {
      devFee = infiTokenTransfered.div(2);
    }

    // Trigger function on infi token contract
    await daiToken
      .connect(holder1)
      .approve(pl.address, data.request.premiumSum);
    await infiToken
      .connect(holder1)
      ['transferAndCall(address,uint256,bytes)'](
        pl.address,
        infiTokenTransfered,
        payloadInBytes
      );
    console.log('Example Data');
    console.log('Infi Token Transferered', infiTokenTransfered.toString());
    console.log('Payload in Bytes', payloadInBytes);
    // Expect Data
    const memberTokenAfter = await infiToken.balanceOf(holder1.address);
    const poolTokenAfter = await infiToken.balanceOf(pl.address);
    const poolDaiTokenAfter = await daiToken.balanceOf(pl.address);
    const storedData = await ld.getCoverRequestById(requestCoverId);
    expect(storedData.insuredSum).to.eq(data.request.insuredSum);
    expect(storedData.coverMonths).to.eq(data.request.coverMonths);
    expect(storedData.insuredSum).to.eq(data.request.insuredSum);
    expect(storedData.insuredSumTarget).to.eq(data.request.insuredSumTarget);
    expect(storedData.insuredSumCurrency).to.eq(
      data.request.insuredSumCurrency
    );
    expect(storedData.premiumSum).to.eq(data.request.premiumSum);
    expect(storedData.premiumCurrency).to.eq(data.request.premiumCurrency);
    // expect(storedData.expiredAt).to.eq(data.request.expiredAt);
    expect(storedData.coinId).to.eq(data.request.coinId);
    expect(storedData.coverLimit.coverType).to.eq(
      data.request.coverLimit.coverType
    );
    expect(storedData.coverLimit.territoryIds).to.have.lengthOf(
      data.request.coverLimit.territoryIds.length
    );
    expect(memberTokenAfter).to.eq(memberTokenBefore.sub(infiTokenTransfered));
    expect(poolTokenAfter).to.eq(poolTokenBefore);
    expect(await infiToken.balanceOf(devWallet.address)).to.eq(
      devTokenBefore.add(devFee)
    );
    expect(poolDaiTokenAfter).to.eq(
      poolDaiTokenBefore.add(data.request.premiumSum)
    );
  });

  it('Create Request Cover - USDC', async () => {
    // Pre-process
    const memberTokenBefore = await infiToken.balanceOf(holder1.address);
    const poolTokenBefore = await infiToken.balanceOf(pl.address);
    const devTokenBefore = await infiToken.balanceOf(devWallet.address);
    const poolUSDCTokenBefore = await usdcToken.balanceOf(pl.address);
    const requestCoverId = 1;

    // Permit Data
    const nonce = await usdcToken.nonces(holder1.address);
    const signPermitDaiData: EIP2612Permit = await signPermitUSDC(
      holder1, // owner
      pl.address, // spender
      nonce.toNumber(), // nonce
      ethers.utils.parseUnits('5000', usdcDecimal),
      getNowUnix() + calculateDayInUnix(1) // deadline 1 day expired
    );
    const permitDataBytes: string = encodePermit(
      CURRENCY_TYPE.USDC,
      signPermitDaiData,
      encode
    );

    const coinLatestPrice = await listingGateway.getChainlinkPrice(
      CURRENCY_TYPE.USDC
    );

    // Process
    const data: CreateCoverRequestData = {
      request: {
        ...coverRequestData,
        insuredSum: ethers.utils.parseUnits('1729', usdcDecimal),
        insuredSumTarget: ethers.utils.parseUnits('1727', usdcDecimal), // tolerance 2 token
        insuredSumCurrency: CURRENCY_TYPE.USDC,
        premiumSum: ethers.utils.parseUnits('249.999979', usdcDecimal),
        premiumCurrency: CURRENCY_TYPE.USDC,
        holder: holder1.address,
      },
      assetPricing: await signCoinPricingInfo(
        dataCoinUsdc,
        coinSigner,
        pl.address
      ), // verify by pool
      feePricing: await signCoinPricingInfo(
        dataCoinInfi,
        coinSigner,
        pl.address
      ), // verify by pool
      premiumPermit: permitDataBytes,
      roundId: coinLatestPrice.roundId,
    };

    const payloadInBytes = encodeParam(
      PAY_TYPE.CREATE_COVER_REQUEST,
      data,
      encode
    );
    const infiTokenTransfered = calculateListingFee(
      data.request.insuredSum,
      usdcDecimal,
      data.feePricing.coinPrice,
      coinLatestPrice.decimals,
      coinLatestPrice.price
    );
    let devFee;
    if (infiTokenTransfered.mod(2).eq(1)) {
      devFee = infiTokenTransfered.div(2).add(1);
    } else {
      devFee = infiTokenTransfered.div(2);
    }

    // Trigger function on infi token contract
    await infiToken
      .connect(holder1)
      ['transferAndCall(address,uint256,bytes)'](
        pl.address,
        infiTokenTransfered,
        payloadInBytes
      );

    // Expect Data
    const memberTokenAfter = await infiToken.balanceOf(holder1.address);
    const poolTokenAfter = await infiToken.balanceOf(pl.address);
    const poolUSDCTokenAfter = await usdcToken.balanceOf(pl.address);
    const storedData = await ld.getCoverRequestById(requestCoverId);
    expect(storedData.insuredSum).to.eq(data.request.insuredSum);
    expect(storedData.coverMonths).to.eq(data.request.coverMonths);
    expect(storedData.insuredSum).to.eq(data.request.insuredSum);
    expect(storedData.insuredSumTarget).to.eq(data.request.insuredSumTarget);
    expect(storedData.insuredSumCurrency).to.eq(
      data.request.insuredSumCurrency
    );
    expect(storedData.premiumSum).to.eq(data.request.premiumSum);
    expect(storedData.premiumCurrency).to.eq(data.request.premiumCurrency);
    // expect(storedData.expiredAt).to.eq(data.request.expiredAt);
    expect(storedData.coinId).to.eq(data.request.coinId);
    expect(storedData.coverLimit.coverType).to.eq(
      data.request.coverLimit.coverType
    );
    expect(storedData.coverLimit.territoryIds).to.have.lengthOf(
      data.request.coverLimit.territoryIds.length
    );
    expect(memberTokenAfter).to.eq(memberTokenBefore.sub(infiTokenTransfered));
    expect(poolTokenAfter).to.eq(poolTokenBefore);
    expect(await infiToken.balanceOf(devWallet.address)).to.eq(
      devTokenBefore.add(devFee)
    );
    expect(poolUSDCTokenAfter).to.eq(
      poolUSDCTokenBefore.add(data.request.premiumSum)
    );
  });

  it('Create Request Cover - USDT', async () => {
    // Pre-process
    const memberTokenBefore = await infiToken.balanceOf(holder1.address);
    const poolTokenBefore = await infiToken.balanceOf(pl.address);
    const devTokenBefore = await infiToken.balanceOf(devWallet.address);
    const poolUSDTTokenBefore = await usdtToken.balanceOf(pl.address);
    const requestCoverId = 2;

    // Process
    const coinLatestPrice = await listingGateway.getChainlinkPrice(
      CURRENCY_TYPE.USDT
    );

    const data: CreateCoverRequestData = {
      request: {
        ...coverRequestData,
        insuredSum: ethers.utils.parseUnits('1729', usdtDecimal),
        insuredSumTarget: ethers.utils.parseUnits('1729', usdtDecimal),
        insuredSumCurrency: CURRENCY_TYPE.USDT,
        premiumSum: ethers.utils.parseUnits('249.999979', usdtDecimal),
        premiumCurrency: CURRENCY_TYPE.USDT,
        holder: holder1.address,
      },
      assetPricing: await signCoinPricingInfo(
        dataCoinUsdt,
        coinSigner,
        pl.address
      ), // verify by pool
      feePricing: await signCoinPricingInfo(
        dataCoinInfi,
        coinSigner,
        pl.address
      ), // verify by pool
      premiumPermit: EMPTY_PERMIT_BYTES,
      roundId: coinLatestPrice.roundId,
    };
    const payloadInBytes = encodeParam(
      PAY_TYPE.CREATE_COVER_REQUEST,
      data,
      encode
    );
    const infiTokenTransfered = calculateListingFee(
      data.request.insuredSum,
      usdtDecimal,
      data.feePricing.coinPrice,
      coinLatestPrice.decimals,
      coinLatestPrice.price
    );
    let devFee;
    if (BigNumber.from(infiTokenTransfered).mod(2).eq(1)) {
      devFee = BigNumber.from(infiTokenTransfered).div(2).add(1);
    } else {
      devFee = infiTokenTransfered.div(2);
    }

    // Approve smart contract to use token and Trigger function on infi token contract
    await usdtToken
      .connect(holder1)
      .approve(pl.address, data.request.premiumSum);
    await infiToken
      .connect(holder1)
      ['transferAndCall(address,uint256,bytes)'](
        pl.address,
        infiTokenTransfered,
        payloadInBytes
      );
    // Expect Data
    const memberTokenAfter = await infiToken.balanceOf(holder1.address);
    const poolTokenAfter = await infiToken.balanceOf(pl.address);
    const poolUSDTTokenAfter = await usdtToken.balanceOf(pl.address);
    const storedData = await ld.getCoverRequestById(requestCoverId);
    expect(storedData.insuredSum).to.eq(data.request.insuredSum);
    expect(storedData.coinId).to.eq(data.request.coinId);
    // expect(storedData.expiredAt).to.eq(data.request.expiredAt);
    expect(storedData.insuredSumCurrency).to.eq(
      data.request.insuredSumCurrency
    );
    expect(storedData.coverLimit.coverType).to.eq(
      data.request.coverLimit.coverType
    );
    expect(storedData.coverLimit.territoryIds).to.have.lengthOf(
      data.request.coverLimit.territoryIds.length
    );
    expect(memberTokenAfter).to.eq(memberTokenBefore.sub(infiTokenTransfered));
    expect(poolTokenAfter).to.eq(poolTokenBefore);
    expect(await infiToken.balanceOf(devWallet.address)).to.eq(
      devTokenBefore.add(devFee)
    );
    expect(poolUSDTTokenAfter).to.eq(
      poolUSDTTokenBefore.add(data.request.premiumSum)
    );
  });

  it('Compare Encoding', async () => {
    const coinLatestPrice = await listingGateway.getChainlinkPrice(
      CURRENCY_TYPE.DAI
    );
    const data: CreateCoverRequestData = {
      request: {
        ...coverRequestData,
        insuredSum: ethers.utils.parseUnits('1729', daiDecimal),
        insuredSumTarget: ethers.utils.parseUnits('1729', daiDecimal),
        insuredSumCurrency: CURRENCY_TYPE.DAI,
        premiumSum: ethers.utils.parseUnits('249.9999979', daiDecimal),
        premiumCurrency: CURRENCY_TYPE.DAI,
        holder: holder1.address,
      },
      assetPricing: await signCoinPricingInfo(
        dataCoinDai,
        coinSigner,
        pl.address
      ), // verify by pool
      feePricing: await signCoinPricingInfo(
        dataCoinInfi,
        coinSigner,
        pl.address
      ), // verify by pool
      premiumPermit: EMPTY_PERMIT_BYTES,
      roundId: coinLatestPrice.roundId,
    };

    const encodedCreateCoverRequestData1 = ethers.utils.hexDataSlice(
      encode.interface.encodeFunctionData('encodeCreateCoverRequestData', [
        data,
      ]),
      4
    );

    const encodedCreateCoverRequestData2 = await encode.encodeCreateCoverRequestData(
      data
    );

    expect(
      encodedCreateCoverRequestData1 === encodedCreateCoverRequestData2
    ).to.eq(true);
  });
});
