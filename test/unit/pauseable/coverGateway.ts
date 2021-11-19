import { CoverGateway } from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';

import { getContract } from '../utils/deployments';
import { SignerWithAddress } from '../utils/interfaces';

const { expect } = chai;

describe('CoverGateway Pauseable', () => {
  let cg: CoverGateway;
  let deployer: SignerWithAddress;
  let coinSigner: SignerWithAddress;

  before(async () => {
    await deployments.fixture(['Config'], {
      keepExistingDeployments: true,
    });

    cg = await getContract<CoverGateway>('CoverGateway');
    ({ deployer, coinSigner } = await ethers.getNamedSigners());
  });

  it('should be unpaused when deployed', async () => {
    expect(await cg.connect(deployer).paused()).to.eq(false);
  });

  it('should be fail to change pause status when not deployer who trigger it', async () => {
    await expect(cg.connect(coinSigner).pause()).to.be.revertedWith(
      'ERR_AUTH_1'
    );

    await expect(cg.connect(coinSigner).unpause()).to.be.revertedWith(
      'ERR_AUTH_1'
    );
  });

  it('should be success change the status when deployer who trigger it', async () => {
    await cg.connect(deployer).pause();
    expect(await cg.connect(deployer).paused()).to.eq(true);

    await cg.connect(deployer).unpause();
    expect(await cg.connect(deployer).paused()).to.eq(false);
  });

  it('should prevent access to function, when contract is paused', async () => {
    await cg.connect(deployer).pause();
    await expect(cg.connect(deployer).pause()).to.be.revertedWith('paused');
    await cg.connect(deployer).unpause();
  });
});
