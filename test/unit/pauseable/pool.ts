import { Pool } from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';

import { getContract } from '../utils/deployments';
import { SignerWithAddress } from '../utils/interfaces';

const { expect } = chai;

describe('Pool Pauseable', () => {
  let pl: Pool;
  let deployer: SignerWithAddress;
  let coinSigner: SignerWithAddress;

  before(async () => {
    await deployments.fixture(['Config'], {
      keepExistingDeployments: true,
    });

    pl = await getContract<Pool>('Pool');
    ({ deployer, coinSigner } = await ethers.getNamedSigners());
  });

  it('should be unpaused when deployed', async () => {
    expect(await pl.connect(deployer).paused()).to.eq(false);
  });

  it('should be fail to change pause status when not deployer who trigger it', async () => {
    await expect(pl.connect(coinSigner).pause()).to.be.revertedWith(
      'ERR_AUTH_1'
    );

    await expect(pl.connect(coinSigner).unpause()).to.be.revertedWith(
      'ERR_AUTH_1'
    );
  });

  it('should be success change the status when deployer who trigger it', async () => {
    await pl.connect(deployer).pause();
    expect(await pl.connect(deployer).paused()).to.eq(true);

    await pl.connect(deployer).unpause();
    expect(await pl.connect(deployer).paused()).to.eq(false);
  });

  it('should prevent access to function, when contract is paused', async () => {
    await pl.connect(deployer).pause();
    await expect(pl.connect(deployer).pause()).to.be.revertedWith('paused');
    await pl.connect(deployer).unpause();
  });
});
