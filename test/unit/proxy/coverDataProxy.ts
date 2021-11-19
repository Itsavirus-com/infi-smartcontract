import { CoverData, UUPSProxy } from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';
import { DeployResult } from 'hardhat-deploy/types';

import { SignerWithAddress } from '../utils/interfaces';

const { expect } = chai;

describe('Cover Data Proxy', async () => {
  let proxyAdmin: SignerWithAddress;
  let wrongAdmin: SignerWithAddress;
  let coverDataImpl: CoverData;
  let coverDataProxy: UUPSProxy;
  let newCoverDataImpl: DeployResult;

  const args: any[] = [];

  before(async () => {
    await deployments.fixture(['Config'], {
      keepExistingDeployments: true,
    });

    ({
      deployer: proxyAdmin,
      test: wrongAdmin,
    } = await ethers.getNamedSigners());
    coverDataImpl = await ethers.getContract<CoverData>('CoverData');
    coverDataProxy = await ethers.getContract<UUPSProxy>('CoverData');
    newCoverDataImpl = await deployments.deploy(
      'CoverDataDummyImplementation',
      {
        from: proxyAdmin.address,
        args,
        log: true,
      }
    );
    wrongAdmin = await ethers.getNamedSigner('test');
  });

  describe('Upgrade contract', async () => {
    it('Should fail upgrade when actor is not admin', async () => {
      await expect(
        coverDataImpl.connect(wrongAdmin).upgradeTo(newCoverDataImpl.address)
      ).to.be.revertedWith('ERR_AUTH_5');
    });

    it('Should success upgrade when actor is admin', async () => {
      await coverDataImpl
        .connect(proxyAdmin)
        .upgradeTo(newCoverDataImpl.address);

      expect(await coverDataProxy.getImplementation()).to.eq(
        newCoverDataImpl.address
      );
    });
  });
});
