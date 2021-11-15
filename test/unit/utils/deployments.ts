import { Contract, Signer } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { Deployment } from 'hardhat-deploy/types';

async function getProxiedOrNull(
  proxyName: string,
  implName: string
): Promise<Deployment | null> {
  const proxy =
    (await deployments.getOrNull(proxyName)) ||
    (await deployments.getOrNull(`${proxyName}Dummy`));

  if (proxy) {
    return {
      ...(await deployments.get(implName)),
      address: proxy.address,
    };
  } else {
    return null;
  }
}

export async function get(name: string): Promise<Deployment> {
  return (
    (await getProxiedOrNull(`UChildERC20Proxy${name}`, `UChild${name}`)) ||
    (await getProxiedOrNull(`FiatTokenProxy${name}`, `FiatToken${name}`)) ||
    deployments.get(name)
  );
}

export async function getOrNull(name: string): Promise<Deployment | null> {
  return (
    (await getProxiedOrNull(`UChildERC20Proxy${name}`, `UChild${name}`)) ||
    (await getProxiedOrNull(`FiatTokenProxy${name}`, `FiatToken${name}`)) ||
    deployments.getOrNull(name)
  );
}

export async function getContractOrNull<T extends Contract>(
  contractName: string,
  signer?: Signer | string
): Promise<T | null> {
  if (deployments !== undefined) {
    const contract = await get(contractName);
    if (!contract) {
      return null;
    }

    return (await ethers.getContractAt(
      contract.abi,
      contract.address,
      signer
    )) as T;
  }

  throw new Error(
    `No Deployment Plugin Installed, try 'import "hardhat-deploy"'`
  );
}

export async function getContract<T extends Contract>(
  contractName: string,
  signer?: Signer | string
): Promise<T> {
  const contract = await getContractOrNull<T>(contractName, signer);
  if (contract === null) {
    throw new Error(`No Contract deployed with name ${contractName}`);
  }
  return contract;
}
