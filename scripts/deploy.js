const hre = require("hardhat");

async function main() {
  console.log("Deploying Symbiote contracts...");
  
  // Deploy Agent Registry
  console.log("Deploying AgentRegistry...");
  const Registry = await hre.ethers.getContractFactory("AgentRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("AgentRegistry deployed to:", registryAddress);
  
  // Deploy Vault
  console.log("Deploying SymbioteVault...");
  const Vault = await hre.ethers.getContractFactory("SymbioteVault");
  const vault = await Vault.deploy();
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("SymbioteVault deployed to:", vaultAddress);
  
  // Verify contracts (if not local network)
  const network = hre.network.name;
  if (network !== "hardhat" && network !== "localhost") {
    try {
      await hre.run("verify:verify", {
        address: registryAddress,
        constructorArguments: []
      });
      console.log("AgentRegistry verified");
      
      await hre.run("verify:verify", {
        address: vaultAddress,
        constructorArguments: []
      });
      console.log("SymbioteVault verified");
    } catch (error) {
      console.log("Verification failed (may need API key):", error.message);
    }
  }
  
  console.log("\n=== Deployment Summary ===");
  console.log("Network:", network);
  console.log("AgentRegistry:", registryAddress);
  console.log("SymbioteVault:", vaultAddress);
  
  // Save deployment addresses
  const fs = require("fs");
  const deploymentInfo = {
    network,
    contracts: {
      registry: registryAddress,
      vault: vaultAddress
    },
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync(
    "./deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\nDeployment info saved to deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
