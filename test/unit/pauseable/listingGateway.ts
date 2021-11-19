import { ListingGateway } from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';

import { getContract } from '../utils/deployments';
import { SignerWithAddress } from '../utils/interfaces';

const { expect } = chai;

describe('ListingGateway Pauseable', () => {
  let lg: ListingGateway;
  let deployer: SignerWithAddress;
  let coinSigner: SignerWithAddress;

  before(async () => {
    await deployments.fixture(['Config'], {
      keepExistingDeployments: true,
    });

    lg = await getContract<ListingGateway>('ListingGateway');
    ({ deployer, coinSigner } = await ethers.getNamedSigners());
  });

  it('should be unpaused when deployed', async () => {
    expect(await lg.connect(deployer).paused()).to.eq(false);
  });

  it('should be fail to change pause status when not deployer who trigger it', async () => {
    await expect(lg.connect(coinSigner).pause()).to.be.revertedWith(
      'ERR_AUTH_1'
    );

    await expect(lg.connect(coinSigner).unpause()).to.be.revertedWith(
      'ERR_AUTH_1'
    );
  });

  it('should be success change the status when deployer who trigger it', async () => {
    await lg.connect(deployer).pause();
    expect(await lg.connect(deployer).paused()).to.eq(true);

    await lg.connect(deployer).unpause();
    expect(await lg.connect(deployer).paused()).to.eq(false);
  });

  it('should prevent access to function, when contract is paused', async () => {
    await lg.connect(deployer).pause();
    await expect(lg.connect(deployer).pause()).to.be.revertedWith('paused');
    await lg.connect(deployer).unpause();
  });
});
