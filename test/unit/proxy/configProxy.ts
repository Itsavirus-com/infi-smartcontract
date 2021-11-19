import { Config, Pool, UUPSProxy } from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';
import { DeployResult } from 'hardhat-deploy/types';

import { SignerWithAddress } from '../utils/interfaces';

const { expect } = chai;

describe('Config Proxy', async () => {
  let proxyAdmin: SignerWithAddress;
  let wrongAdmin: SignerWithAddress;
  let configImplementation: Config;
  let configProxy: UUPSProxy;
  let newConfigImplementation: DeployResult;
  let pl: Pool;

  const args: any[] = [];

  before(async () => {
    await deployments.fixture(['Config'], {
      keepExistingDeployments: true,
    });

    ({
      deployer: proxyAdmin,
      test: wrongAdmin,
    } = await ethers.getNamedSigners());
    configImplementation = await ethers.getContract<Config>('Config');
    configProxy = await ethers.getContract<UUPSProxy>('Config');
    pl = await ethers.getContract<Pool>('Pool');
    newConfigImplementation = await deployments.deploy(
      'ConfigDummyImplementation',
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
        configImplementation
          .connect(wrongAdmin)
          .upgradeTo(newConfigImplementation.address)
      ).to.be.revertedWith('ERR_AUTH_5');
    });

    it('Should success run initializer', async () => {
      expect(await configImplementation.maxDevaluation()).to.be.eq(
        ethers.BigNumber.from(25)
      );

      expect(await configImplementation.maxDevaluation()).to.be.eq(
        ethers.BigNumber.from(25)
      );
    });

    it('Should fail when run initializer more than one', async () => {
      await expect(
        configImplementation.connect(proxyAdmin).initialize()
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('Should success upgrade when actor is admin', async () => {
      await configImplementation
        .connect(proxyAdmin)
        .upgradeTo(newConfigImplementation.address);

      expect(await configProxy.getImplementation()).to.eq(
        newConfigImplementation.address
      );
    });

    it('Should keep storage data same as before upgrading the implementation', async () => {
      expect(await configImplementation.isInternal(pl.address)).to.eq(true);
    });
  });
});
