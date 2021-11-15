import {
  Encode,
  Encode__factory,
  Master,
  Master__factory,
  Pool,
  Pool__factory,
} from '@project/contracts/typechain';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { ethers } from 'hardhat';
import { EMPTY_PERMIT_BYTES, PAY_TYPE } from '../utils/constants';
import { CoinPricingInfo, SignerWithAddress } from '../utils/interfaces';
import { encodeParam } from '../utils/paramUtils';

chai.use(chaiAsPromised);

const data = {
  coinId: 'insured-finance',
  coinSymbol: 'infi',
  lastUpdatedAt: 1622181240,
  coinPrice: 1000,
};

const domain = {
  name: 'insured-finance',
  version: 'v1',
  chainId: 0,
  verifyingContract: '', // '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
  // salt: "0xb225c57bf2111d6955b97ef0f55525b5a400dc909a5506e34b102e193dd53406"
};

describe('General Testing', () => {
  let wallet: SignerWithAddress;
  let deployer: SignerWithAddress;
  let masterFactory: Master__factory;
  let master: Master;
  let encodeFactory: Encode__factory;
  let encode: Encode;
  let poolFactory: Pool__factory;
  let pool: Pool;

  before(async () => {
    [wallet, deployer] = await ethers.getSigners();
    masterFactory = new Master__factory(deployer);
    master = await masterFactory.deploy();
    encodeFactory = new Encode__factory(deployer);
    encode = await encodeFactory.deploy();
    poolFactory = new Pool__factory(deployer);
    pool = await poolFactory.deploy();

    // Set verifying contract address to master contract address
    domain.verifyingContract = master.address;
    domain.chainId = await deployer.getChainId();
  });

  xit('Check signature', async () => {
    // This one is working like a charm
    const typedData = {
      types: {
        CoinPricingInfo: [
          { name: 'coinId', type: 'string' },
          { name: 'coinSymbol', type: 'string' },
          { name: 'coinPrice', type: 'uint256' },
          { name: 'lastUpdatedAt', type: 'uint256' },
        ],
      },
      // primaryType: 'CoinPricingInfo' as const,
      message: {
        coinId: data.coinId,
        coinSymbol: data.coinSymbol,
        coinPrice: data.coinPrice,
        lastUpdatedAt: data.lastUpdatedAt,
      },
    };

    // const digest = TypedDataUtils.encodeDigest(typedData)
    // const digest = ethers.utils._TypedDataEncoder.hash(
    //   typedData.domain,
    //   typedData.types,
    //   typedData.message,
    // );

    // const signature = await wallet.signMessage(digest)
    const signatureTypedData = await wallet._signTypedData(
      domain,
      typedData.types,
      typedData.message
    );
    // console.log(signature)
    // console.log(domain);
    // console.log(await master.getDomainParams());
    // console.log('chain Id solidity : ', (await master.getChainId()).toString());
    // console.log('domainSeparatorEtherJs', ethers.utils._TypedDataEncoder.hashDomain(domain))
    // console.log('domainSeparatorSolidity', await master.getDomainSeparator())

    // console.log(signatureTypedData)

    const signatureSplit = await ethers.utils.splitSignature(
      signatureTypedData
    );
    const { v, r, s } = signatureSplit;

    const coinPricingInfo: CoinPricingInfo = {
      coinId: data.coinId,
      coinSymbol: data.coinSymbol,
      coinPrice: data.coinPrice,
      lastUpdatedAt: data.lastUpdatedAt,
      sigV: v,
      sigR: r,
      sigS: s,
    };
    typedData.message.coinId = 'btx'; // to make it invalid
    const verifyMessage = await pool.verifyMessage(
      coinPricingInfo,
      wallet.address
    );

    console.log(verifyMessage);
  });

  xit('test passing payload param for Request', async () => {
    console.log('test passing payload param for Request');
    // Payload Request Cover
    const payload: Parameters<Encode['encodeCreateCoverRequestData']>[0] = {
      request: {
        coverMonths: 1,
        insuredSum: 12312,
        insuredSumTarget: 12312,
        insuredSumCurrency: 0,
        premiumSum: 12123,
        premiumCurrency: 0,
        expiredAt: 10,
        coinId: 'infi',
        coverLimit: {
          coverType: 0,
          territoryIds: [0, 1],
        },
        coverQty: 100,
        insuredSumRule: 1,
        holder: '',
      },
      assetPricing: {
        coinId: 'insured-finance',
        coinSymbol: 'infi',
        lastUpdatedAt: 371233,
        coinPrice: 123123,
        sigV: 27,
        sigR:
          '0x4c900fa126df66df20fa64b21a854e4855fcbddbfcd97c7f2be30c948c1e3890',
        sigS:
          '0x72f195e523a36b51a0c06bbe4be1088ab0a036d3796bd7c57b9a76d50b9f49a8',
      },
      feePricing: {
        coinId: 'insured-finance',
        coinSymbol: 'infi',
        lastUpdatedAt: 371233,
        coinPrice: 123123,
        sigV: 27,
        sigR:
          '0x4c900fa126df66df20fa64b21a854e4855fcbddbfcd97c7f2be30c948c1e3890',
        sigS:
          '0x72f195e523a36b51a0c06bbe4be1088ab0a036d3796bd7c57b9a76d50b9f49a8',
      },
      premiumPermit: EMPTY_PERMIT_BYTES,
      roundId: 1,
    };

    // encode
    const inputPayloadParamBytes = encodeParam(
      PAY_TYPE.CREATE_COVER_REQUEST,
      payload,
      encode
    );

    // Call function for passing data
    console.log(await encode.addPayloadParamBytes(inputPayloadParamBytes));
  });

  xit('test passing payload param for Offer', async () => {
    console.log('test passing payload param for Offer');

    // Payload Offer Cover
    const payload: Parameters<Encode['encodeCreateCoverOfferData']>[0] = {
      offer: {
        minCoverMonths: ethers.BigNumber.from(10),
        insuredSum: 10000,
        insuredSumCurrency: 0,
        premiumCostPerMonth: 1,
        premiumCurrency: 0,
        expiredAt: 1728728,
        coinId: 'infi',
        coverLimit: {
          coverType: 0,
          territoryIds: [0, 1],
        },
        insuredSumRule: 1,
        funder: '',
      },
      feePricing: {
        coinId: 'insured-finance',
        coinSymbol: 'infi',
        lastUpdatedAt: 371233,
        coinPrice: 123123,
        sigV: 27,
        sigR:
          '0x4c900fa126df66df20fa64b21a854e4855fcbddbfcd97c7f2be30c948c1e3890',
        sigS:
          '0x72f195e523a36b51a0c06bbe4be1088ab0a036d3796bd7c57b9a76d50b9f49a8',
      },
      assetPricing: {
        coinId: 'insured-finance',
        coinSymbol: 'infi',
        lastUpdatedAt: 371233,
        coinPrice: 123123,
        sigV: 27,
        sigR:
          '0x4c900fa126df66df20fa64b21a854e4855fcbddbfcd97c7f2be30c948c1e3890',
        sigS:
          '0x72f195e523a36b51a0c06bbe4be1088ab0a036d3796bd7c57b9a76d50b9f49a8',
      },
      depositPeriod: 3,
      roundId: 1,
      fundingPermit: EMPTY_PERMIT_BYTES,
    };
    // encode
    const inputPayloadParamBytes = encodeParam(
      PAY_TYPE.CREATE_COVER_OFFER,
      payload,
      encode
    );

    // Call function for passing data
    console.log(await encode.addPayloadParamBytes(inputPayloadParamBytes));
  });
});
