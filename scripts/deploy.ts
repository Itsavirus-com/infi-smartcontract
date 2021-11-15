import { ethers } from 'hardhat';

async function deployContract(name: string, args: unknown[]) {
  const factory = await ethers.getContractFactory(name);

  // If we had constructor arguments, they would be passed into deploy()
  const contract = await factory.deploy(...args);

  // The address the Contract WILL have once mined
  console.log(`${name}:`, contract.address);

  // The transaction that was sent to the network to deploy the Contract
  console.log('TxHash:', contract.deployTransaction.hash);

  // The contract is NOT deployed yet; we must wait until it is mined
  await contract.deployed();

  return contract;
}

async function main() {
  await deployContract('Counter', []);

  await deployContract('Token', []);

  await deployContract('GravatarRegistry', []);

  const candidateNames = [
    ethers.utils.formatBytes32String('Rama'),
    ethers.utils.formatBytes32String('Nick'),
    ethers.utils.formatBytes32String('Jose'),
  ];
  await deployContract('Voting', [candidateNames]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
