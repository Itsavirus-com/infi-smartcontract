import { Pool, UUPSProxy } from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';
import { DeployResult } from 'hardhat-deploy/types';

import { SignerWithAddress } from '../utils/interfaces';

const { expect } = chai;

describe('Pool Proxy', async () => {
  let proxyAdmin: SignerWithAddress;
  let wrongAdmin: SignerWithAddress;
  let poolImplementation: Pool;
  let poolProxy: UUPSProxy;
  let newPoolImplementation: DeployResult;

  const args: any[] = [];

  before(async () => {
    await deployments.fixture(['Config'], {
      keepExistingDeployments: true,
    });

    ({
      deployer: proxyAdmin,
      test: wrongAdmin,
    } = await ethers.getNamedSigners());
    poolImplementation = await ethers.getContract<Pool>('Pool');
    poolProxy = await ethers.getContract<UUPSProxy>('Pool');
    newPoolImplementation = await deployments.deploy(
      'PoolDummyImplementation',
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
        poolImplementation
          .connect(wrongAdmin)
          .upgradeTo(newPoolImplementation.address)
      ).to.be.revertedWith('ERR_AUTH_5');
    });

    it('Should success run initializer', async () => {
      expect(await poolImplementation.DOMAIN_SEPARATOR()).to.not.eq(
        '0x0000000000000000000000000000000000000000'
      );
    });

    it('Should fail when run initializer more than one', async () => {
      await expect(
        poolImplementation.connect(proxyAdmin).initialize()
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('Should success upgrade when actor is admin', async () => {
      await poolImplementation
        .connect(proxyAdmin)
        .upgradeTo(newPoolImplementation.address);

      expect(await poolProxy.getImplementation()).to.eq(
        newPoolImplementation.address
      );
    });

    it('Should keep storage data same as before upgrading the implementation', async () => {
      expect(await poolImplementation.devWallet()).to.not.eq(
        '0x0000000000000000000000000000000000000000'
      );

      expect(await poolImplementation.daiTokenAddr()).to.not.eq(
        '0x0000000000000000000000000000000000000000'
      );

      expect(await poolImplementation.usdtTokenAddr()).to.not.eq(
        '0x0000000000000000000000000000000000000000'
      );

      expect(await poolImplementation.usdcTokenAddr()).to.not.eq(
        '0x0000000000000000000000000000000000000000'
      );
    });
  });
});
