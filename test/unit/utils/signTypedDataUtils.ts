import { UChildDAI, UChildUSDC } from '@project/contracts/typechain';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

import { getContract } from './deployments';
import {
  CoinPricingInfo,
  CoinPricingInfoUnsigned,
  DAIPermit,
  EIP2612Permit,
  SignerWithAddress,
} from './interfaces';

const domain = {
  name: 'insured-finance',
  version: 'v1',
  chainId: 0,
  verifyingContract: '', // '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
  // salt: "0xb225c57bf2111d6955b97ef0f55525b5a400dc909a5506e34b102e193dd53406"
};

export async function signCoinPricingInfo(
  coinData: CoinPricingInfoUnsigned,
  signer: SignerWithAddress,
  verifyingContractAddr: string
): Promise<CoinPricingInfo> {
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
      coinId: coinData.coinId,
      coinSymbol: coinData.coinSymbol,
      coinPrice: coinData.coinPrice,
      lastUpdatedAt: coinData.lastUpdatedAt,
    },
  };

  domain.verifyingContract = verifyingContractAddr;
  domain.chainId = await signer.getChainId();

  const signatureTypedData = await signer._signTypedData(
    domain,
    typedData.types,
    typedData.message
  );
  const signatureSplit = await ethers.utils.splitSignature(signatureTypedData);
  const { v, r, s } = signatureSplit;

  const coinPricingInfo: CoinPricingInfo = {
    coinId: coinData.coinId,
    coinSymbol: coinData.coinSymbol,
    coinPrice: coinData.coinPrice,
    lastUpdatedAt: ethers.BigNumber.from(coinData.lastUpdatedAt),
    sigV: ethers.BigNumber.from(v),
    sigR: r,
    sigS: s,
  };
  return coinPricingInfo;
}

export async function signPermitUSDC(
  owner: SignerWithAddress,
  spenderAddr: string,
  nonce: number,
  amount: BigNumber,
  deadline: number
): Promise<EIP2612Permit> {
  const usdcToken = await getContract<UChildUSDC>('USDC');
  const chainId = await owner.getChainId();
  const typedData = {
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    domain: {
      name: '(PoS) USD Coin',
      version: '1',
      verifyingContract: usdcToken.address,
      salt: await ethers.utils.hexZeroPad(ethers.utils.hexValue(chainId), 32),
    },
    message: {
      owner: owner.address,
      spender: spenderAddr,
      value: amount,
      nonce,
      deadline,
    },
  };

  const signatureTypedData = await owner._signTypedData(
    typedData.domain,
    typedData.types,
    typedData.message
  );
  const signatureSplit = ethers.utils.splitSignature(signatureTypedData);
  const { v, r, s } = signatureSplit;

  const permitData: EIP2612Permit = {
    owner: owner.address,
    spender: spenderAddr,
    value: amount,
    deadline,
    sigV: v,
    sigR: r,
    sigS: s,
  };

  return permitData;
}

export async function signPermitDai(
  owner: SignerWithAddress,
  spender: string,
  nonce: number,
  expiry: number
): Promise<DAIPermit> {
  const daiToken = await getContract<UChildDAI>('DAI');
  const chainId = await owner.getChainId();
  const typedData = {
    types: {
      Permit: [
        {
          name: 'holder',
          type: 'address',
        },
        {
          name: 'spender',
          type: 'address',
        },
        {
          name: 'nonce',
          type: 'uint256',
        },
        {
          name: 'expiry',
          type: 'uint256',
        },
        {
          name: 'allowed',
          type: 'bool',
        },
      ],
    },
    domain: {
      name: '(PoS) Dai Stablecoin',
      version: '1',
      verifyingContract: daiToken.address,
      salt: await ethers.utils.hexZeroPad(ethers.utils.hexValue(chainId), 32),
    },
    message: {
      holder: owner.address,
      spender,
      nonce,
      expiry,
      allowed: true,
    },
  };

  const signatureTypedData = await owner._signTypedData(
    typedData.domain,
    typedData.types,
    typedData.message
  );
  const signatureSplit = ethers.utils.splitSignature(signatureTypedData);
  const { v, r, s } = signatureSplit;

  const permitData: DAIPermit = {
    holder: owner.address,
    spender,
    nonce,
    expiry,
    allowed: true,
    sigV: v,
    sigR: r,
    sigS: s,
  };

  return permitData;
}
