const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SymbioteVault", function () {
  let vault;
  let owner;
  let user1;
  let agent;

  beforeEach(async function () {
    [owner, user1, agent] = await ethers.getSigners();
    
    const Vault = await ethers.getContractFactory("SymbioteVault");
    vault = await Vault.deploy();
    await vault.waitForDeployment();
  });

  describe("Deposits", function () {
    it("Should accept deposits", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("1") });
      
      const balance = await vault.getBalance(user1.address);
      expect(balance).to.equal(ethers.parseEther("1"));
    });

    it("Should track total deposits", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("1") });
      
      const tvl = await vault.getTvl();
      expect(tvl).to.equal(ethers.parseEther("1"));
    });

    it("Should reject zero deposits", async function () {
      await expect(
        vault.connect(user1).deposit({ value: 0 })
      ).to.be.revertedWith("Cannot deposit 0");
    });
  });

  describe("Withdrawals", function () {
    it("Should allow withdrawals", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("1") });
      await vault.connect(user1).withdraw(ethers.parseEther("0.5"));
      
      const balance = await vault.getBalance(user1.address);
      expect(balance).to.equal(ethers.parseEther("0.5"));
    });

    it("Should reject insufficient balance", async function () {
      await expect(
        vault.connect(user1).withdraw(ethers.parseEther("1"))
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("Agent Management", function () {
    it("Should register an agent", async function () {
      await vault.registerAgent(agent.address, ethers.parseEther("2"));
      
      const isAgent = await vault.authorizedAgents(agent.address);
      expect(isAgent).to.be.true;
    });

    it("Should reject insufficient bond", async function () {
      await expect(
        vault.registerAgent(agent.address, ethers.parseEther("0.5"))
      ).to.be.revertedWith("Minimum bond is 1 ETH");
    });
  });

  describe("Pause", function () {
    it("Should allow pausing", async function () {
      await vault.setPaused(true);
      
      await expect(
        vault.connect(user1).deposit({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Vault is paused");
    });
  });
});

describe("AgentRegistry", function () {
  let registry;
  let owner;
  let agentOwner;

  beforeEach(async function () {
    [owner, agentOwner] = await ethers.getSigners();
    
    const Registry = await ethers.getContractFactory("AgentRegistry");
    registry = await Registry.deploy();
    await registry.waitForDeployment();
  });

  describe("Registration", function () {
    it("Should register an agent", async function () {
      const tx = await registry.connect(agentOwner).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("1")
      );
      
      // Just check it doesn't revert
      expect(tx).to.not.be.reverted;
    });
  });
});
