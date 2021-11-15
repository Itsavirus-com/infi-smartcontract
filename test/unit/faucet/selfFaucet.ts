/**
 * Copy DAI, FiatTOkenProxyUSDC, FiatTokenUSDC, INFI, SelfFaucet, USDT
 * from goerli deployments folder to hardhat
 *
 * Update hardhat network setting on hardhat.config
 * Update tags to goerli, and forking url and blocknumber to goerli
 */
import { BigNumberish } from '@ethersproject/bignumber';
import {
  DaiToken,
  InfiToken,
  SelfFaucet,
  UsdcToken,
  UsdtGoerli,
} from '@project/contracts/typechain';
import chai from 'chai';
import { Contract } from 'ethers';
import { deployments, ethers, network } from 'hardhat';

import { SignerWithAddress } from '../utils/interfaces';

const { expect } = chai;

async function getContract<T extends Contract>(contractName: string) {
  const contract = await deployments.get(contractName);
  if (!contract) {
    throw new Error(`Contract ${contractName} not found`);
  }

  let contractAddress: string = contract.address;
  if (contractName === 'FiatTokenUSDC') {
    contractAddress = (await deployments.get(`FiatTokenProxyUSDC`)).address;
  }

  return (await ethers.getContractAt(contract.abi, contractAddress)) as T;
}

describe('Self Faucet', () => {
  let selfFaucet: SelfFaucet;
  let infiToken: InfiToken;
  let daiToken: DaiToken;
  let usdtToken: UsdtGoerli;
  let usdcToken: UsdcToken;

  let infiDecimal: number;
  let daiDecimal: number;
  let usdtDecimal: BigNumberish;
  let usdcDecimal: number;

  let holderINFI: SignerWithAddress;
  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let deployer: SignerWithAddress;

  let contractWithOwner: SelfFaucet;

  before(async () => {
    await deployments.fixture(['Faucet'], {
      keepExistingDeployments: true,
    });

    infiToken = await getContract<InfiToken>('INFI');
    daiToken = await getContract<DaiToken>('DAI');
    usdtToken = await getContract<UsdtGoerli>('USDT');
    usdcToken = await getContract<UsdcToken>('FiatTokenUSDC');
    selfFaucet = await getContract<SelfFaucet>('SelfFaucet');

    ({ holderINFI, holder1, deployer, holder2 } =
      await ethers.getNamedSigners());
    contractWithOwner = selfFaucet.connect(deployer);

    infiDecimal = await infiToken.decimals();
    daiDecimal = await daiToken.decimals();
    usdtDecimal = await usdtToken.decimals();
    usdcDecimal = await usdcToken.decimals();

    infiToken
      .connect(holderINFI)
      .transfer(
        selfFaucet.address,
        ethers.utils.parseUnits('100000', await infiToken.decimals())
      );

    await usdtToken.mint(
      selfFaucet.address,
      ethers.utils.parseUnits('100000', await usdtToken.decimals())
    );
    await daiToken.mint(
      selfFaucet.address,
      ethers.utils.parseUnits('100000', await daiToken.decimals())
    );
    await usdcToken.mint(
      selfFaucet.address,
      ethers.utils.parseUnits('100000', await daiToken.decimals())
    );
  });

  it('should use correct constructor parameters', async () => {
    expect(await selfFaucet.infiTokenAddr()).to.eq(infiToken.address);
    expect(await selfFaucet.daiTokenAddr()).to.eq(daiToken.address);
    expect(await selfFaucet.usdtTokenAddr()).to.eq(usdtToken.address);
    expect(await selfFaucet.usdcTokenAddr()).to.eq(usdcToken.address);

    expect(await selfFaucet.daysBuffer()).to.eq(7);
    expect(await selfFaucet.infiAmount()).to.eq(10000);
    expect(await selfFaucet.daiAmount()).to.eq(10000);
    expect(await selfFaucet.usdtAmount()).to.eq(10000);
    expect(await selfFaucet.usdcAmount()).to.eq(10000);
  });

  describe('Claim Token', async () => {
    it('should fail claim token when function is paused', async () => {
      await contractWithOwner.pause();
      await expect(selfFaucet.claimToken(holder1.address)).to.be.reverted;
      await contractWithOwner.unpause();
    });

    it('should success claim token', async () => {
      const currentInfiBalance = await infiToken.balanceOf(holder1.address);
      const currentDaiBalance = await daiToken.balanceOf(holder1.address);
      const currentUsdtBalance = await usdtToken.balanceOf(holder1.address);
      const currentUsdcBalance = await usdcToken.balanceOf(holder1.address);

      await expect(selfFaucet.claimToken(holder1.address)).to.emit(
        selfFaucet,
        'FaucetTransfer'
      );
      const infiTransferAmount = ethers.utils.parseUnits(
        (await selfFaucet.infiAmount()).toString(),
        infiDecimal
      );

      const daiTransferAmount = ethers.utils.parseUnits(
        (await selfFaucet.daiAmount()).toString(),
        daiDecimal
      );

      const usdtTransferAmount = ethers.utils.parseUnits(
        (await selfFaucet.usdtAmount()).toString(),
        usdtDecimal
      );

      const usdcTransferAmount = ethers.utils.parseUnits(
        (await selfFaucet.usdcAmount()).toString(),
        usdcDecimal
      );

      expect(currentInfiBalance.add(infiTransferAmount)).to.equal(
        await infiToken.balanceOf(holder1.address)
      );
      expect(currentDaiBalance.add(daiTransferAmount)).to.equal(
        await daiToken.balanceOf(holder1.address)
      );
      expect(currentUsdtBalance.add(usdtTransferAmount)).to.equal(
        await usdtToken.balanceOf(holder1.address)
      );
      expect(currentUsdcBalance.add(usdcTransferAmount)).to.equal(
        await usdcToken.balanceOf(holder1.address)
      );
    });

    it('should fail claim token when still in buffer time', async () => {
      await expect(selfFaucet.claimToken(holder1.address)).to.be.revertedWith(
        'ERR_FC_1'
      );
    });

    it('Should return false if address in time buffer', async () => {
      expect(await selfFaucet.checkAddressBuffer(holder1.address)).to.equal(
        false
      );
    });

    it('Should return true if address not in time buffer', async () => {
      expect(await selfFaucet.checkAddressBuffer(holder2.address)).to.equal(
        true
      );
    });

    it('should success if pass the buffer time', async () => {
      const timeBuffer = (await selfFaucet.daysBuffer())
        .mul(24 * 60 * 60)
        .toNumber();

      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;

      await network.provider.send('evm_setNextBlockTimestamp', [
        timestampBefore + timeBuffer,
      ]);
      await network.provider.send('evm_mine');
      await expect(selfFaucet.claimToken(holder1.address)).to.emit(
        selfFaucet,
        'FaucetTransfer'
      );
    });

    it('should success if buffer time set to zero or less than the original or latest claim time', async () => {
      await contractWithOwner.setDaysBuffer(0);
      await selfFaucet.claimToken(holder1.address);
      await contractWithOwner.setDaysBuffer(7);
    });
  });

  describe('Owner Update Data', async () => {
    it('not owner should fail updating only owner parameters', async () => {
      await expect(selfFaucet.setInfiTransferAmount(10)).to.be.reverted;
      await expect(selfFaucet.setDaiTransferAmount(10)).to.be.reverted;
      await expect(selfFaucet.setUsdtTransferAmount(10)).to.be.reverted;
      await expect(selfFaucet.setUsdcTransferAmount(10)).to.be.reverted;
      await expect(selfFaucet.setDaysBuffer(10)).to.be.reverted;
      await expect(selfFaucet.pause()).to.be.reverted;
      await expect(selfFaucet.unpause()).to.be.reverted;
    });

    it('owner should success updating only owner parameters', async () => {
      await contractWithOwner.setInfiTransferAmount(10);
      expect((await selfFaucet.infiAmount()).toString()).to.equal('10');

      await contractWithOwner.setDaiTransferAmount(10);
      expect((await selfFaucet.daiAmount()).toString()).to.equal('10');

      await contractWithOwner.setUsdtTransferAmount(10);
      expect((await selfFaucet.usdtAmount()).toString()).to.equal('10');

      await contractWithOwner.setUsdcTransferAmount(10);
      expect((await selfFaucet.usdcAmount()).toString()).to.equal('10');

      await contractWithOwner.setDaysBuffer(10);
      expect((await selfFaucet.daysBuffer()).toString()).to.equal('10');

      await contractWithOwner.pause();
      expect(await selfFaucet.isPause()).to.equal(true);

      await contractWithOwner.unpause();
      expect(await selfFaucet.isPause()).to.equal(false);
    });
  });

  describe('Transfer Infi Token', async () => {
    it('Owner should success transfer infi token to other address', async () => {
      const currentBalance = await infiToken.balanceOf(holder2.address);
      await contractWithOwner.transferInfi(holder2.address, 1000);
      const totalTransfer = ethers.utils.parseUnits('1000', infiDecimal);
      expect(currentBalance.add(totalTransfer)).to.equal(
        await infiToken.balanceOf(holder2.address)
      );
    });

    it('Not Owner should fail transfer infi token to other address', async () => {
      await expect(selfFaucet.transferInfi(holder2.address, 1000)).to.be
        .reverted;
    });
  });
});
