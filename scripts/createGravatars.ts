import { ethers } from 'hardhat';

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';

// If you don't specify a url, Ethers connects to the default
// (i.e. `http://localhost:8545`)
const provider = new ethers.providers.JsonRpcProvider();

async function main() {
  const factory = await ethers.getContractFactory('GravatarRegistry');

  const registry = factory.attach(CONTRACT_ADDRESS);

  await registry
    .connect(provider.getSigner(0))
    .createGravatar('Carl', 'https://thegraph.com/img/team/team_04.png');

  await registry
    .connect(provider.getSigner(1))
    .createGravatar('Lucas', 'https://thegraph.com/img/team/bw_Lucas.jpg');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
