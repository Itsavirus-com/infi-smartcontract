import { ClaimData, UUPSProxy } from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';
import { DeployResult } from 'hardhat-deploy/types';

import { SignerWithAddress } from '../utils/interfaces';

const { expect } = chai;

describe('Claim Data Proxy', async () => {
  let proxyAdmin: SignerWithAddress;
  let wrongAdmin: SignerWithAddress;
  let claimDataImpl: ClaimData;
  let claimDataProxy: UUPSProxy;
  let newClaimDataImpl: DeployResult;

  const args: any[] = [];

  before(async () => {
    await deployments.fixture(['Config'], {
      keepExistingDeployments: true,
    });

    ({
      deployer: proxyAdmin,
      test: wrongAdmin,
    } = await ethers.getNamedSigners());
    claimDataImpl = await ethers.getContract<ClaimData>('ClaimData');
    claimDataProxy = await ethers.getContract<UUPSProxy>('ClaimData');
    newClaimDataImpl = await deployments.deploy(
      'ClaimDataDummyImplementation',
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
        claimDataImpl.connect(wrongAdmin).upgradeTo(newClaimDataImpl.address)
      ).to.be.revertedWith('ERR_AUTH_5');
    });

    it('Should success upgrade when actor is admin', async () => {
      await claimDataImpl
        .connect(proxyAdmin)
        .upgradeTo(newClaimDataImpl.address);

      expect(await claimDataProxy.getImplementation()).to.eq(
        newClaimDataImpl.address
      );
    });
  });
});
