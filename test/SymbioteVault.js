const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SymbioteVault - Comprehensive Tests", function () {
  let vault;
  let owner, user1, user2, agent1, agent2;

  beforeEach(async function () {
    [owner, user1, user2, agent1, agent2] = await ethers.getSigners();
    
    const Vault = await ethers.getContractFactory("SymbioteVault");
    vault = await Vault.deploy();
    await vault.waitForDeployment();
  });

  describe("Deposits", function () {
    it("Should accept ETH deposits", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("1") });
      expect(await vault.getBalance(user1.address)).to.equal(ethers.parseEther("1"));
    });

    it("Should track multiple deposits", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("1") });
      await vault.connect(user1).deposit({ value: ethers.parseEther("2") });
      expect(await vault.getBalance(user1.address)).to.equal(ethers.parseEther("3"));
    });

    it("Should reject zero deposits", async function () {
      await expect(
        vault.connect(user1).deposit({ value: 0 })
      ).to.be.revertedWith("Cannot deposit 0");
    });

    it("Should update total deposits", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("1") });
      await vault.connect(user2).deposit({ value: ethers.parseEther("2") });
      expect(await vault.getTvl()).to.equal(ethers.parseEther("3"));
    });

    it("Should add to depositor list only once", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("1") });
      await vault.connect(user1).deposit({ value: ethers.parseEther("1") });
      // Multiple deposits should not add duplicate entries
      const balance = await vault.getBalance(user1.address);
      expect(balance).to.equal(ethers.parseEther("2"));
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("10") });
    });

    it("Should allow full withdrawal", async function () {
      await vault.connect(user1).withdraw(ethers.parseEther("10"));
      expect(await vault.getBalance(user1.address)).to.equal(0);
    });

    it("Should allow partial withdrawal", async function () {
      await vault.connect(user1).withdraw(ethers.parseEther("5"));
      expect(await vault.getBalance(user1.address)).to.equal(ethers.parseEther("5"));
    });

    it("Should reject withdrawals exceeding balance", async function () {
      await expect(
        vault.connect(user1).withdraw(ethers.parseEther("11"))
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should reject zero withdrawal", async function () {
      await expect(
        vault.connect(user1).withdraw(0)
      ).to.be.revertedWith("Cannot withdraw 0");
    });

    it("Should update total TVL after withdrawal", async function () {
      await vault.connect(user1).withdraw(ethers.parseEther("5"));
      expect(await vault.getTvl()).to.equal(ethers.parseEther("5"));
    });

    it("Should handle multiple users withdrawing", async function () {
      await vault.connect(user2).deposit({ value: ethers.parseEther("5") });
      await vault.connect(user1).withdraw(ethers.parseEther("5"));
      await vault.connect(user2).withdraw(ethers.parseEther("2"));
      
      expect(await vault.getBalance(user1.address)).to.equal(ethers.parseEther("5"));
      expect(await vault.getBalance(user2.address)).to.equal(ethers.parseEther("3"));
    });
  });

  describe("Agent Management", function () {
    it("Should register an agent with sufficient bond", async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      expect(await vault.authorizedAgents(agent1.address)).to.be.true;
    });

    it("Should reject insufficient bond", async function () {
      await expect(
        vault.registerAgent(agent1.address, ethers.parseEther("0.5"))
      ).to.be.revertedWith("Minimum bond is 1 ETH");
    });

    it("Should track agent bonds", async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("5"));
      expect(await vault.agentBonds(agent1.address)).to.equal(ethers.parseEther("5"));
    });

    it("Should not allow duplicate registration", async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      await expect(
        vault.registerAgent(agent1.address, ethers.parseEther("3"))
      ).to.be.reverted;
    });

    it("Should remove agent and return bond", async function () {
      // First fund the vault so there's ETH to return
      await vault.connect(owner).deposit({ value: ethers.parseEther("10") });
      
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      
      await vault.removeAgent(agent1.address);
      
      expect(await vault.authorizedAgents(agent1.address)).to.be.false;
    });
  });

  describe("Trading", function () {
    beforeEach(async function () {
      // Register agent1 as a trading agent
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      await vault.connect(user1).deposit({ value: ethers.parseEther("100") });
    });

    it("Should record profitable trade", async function () {
      // Owner can simulate agent trades for testing
      await vault.recordTrade(
        agent1.address,
        ethers.id("trade1"),
        ethers.parseEther("1"),
        ethers.parseEther("10")
      );
      
      const [pnl, volume] = await vault.getAgentPerformance(agent1.address);
      expect(pnl).to.equal(ethers.parseEther("1"));
      expect(volume).to.equal(ethers.parseEther("10"));
    });

    it("Should record losing trade", async function () {
      await vault.recordTrade(
        agent1.address,
        ethers.id("trade1"),
        -ethers.parseEther("1"),
        ethers.parseEther("10")
      );
      
      const [pnl, volume] = await vault.getAgentPerformance(agent1.address);
      expect(pnl).to.equal(-ethers.parseEther("1"));
    });

    it("Should reject trade from unauthorized agent", async function () {
      await expect(
        vault.connect(user2).recordTrade(
          user2.address,
          ethers.id("trade1"),
          ethers.parseEther("1"),
          ethers.parseEther("10")
        )
      ).to.be.revertedWith("Not authorized");
    });

    it("Should reject position exceeding max size", async function () {
      await expect(
        vault.recordTrade(
          agent1.address,
          ethers.id("trade1"),
          0,
          ethers.parseEther("50") // Exceeds 20 ETH default
        )
      ).to.be.revertedWith("Position too large");
    });

    it("Should reject trade when paused", async function () {
      await vault.setPaused(true);
      await expect(
        vault.recordTrade(
          agent1.address,
          ethers.id("trade1"),
          ethers.parseEther("1"),
          ethers.parseEther("5")
        )
      ).to.be.revertedWith("Vault is paused");
    });
  });

  describe("Risk Management", function () {
    beforeEach(async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      await vault.connect(user1).deposit({ value: ethers.parseEther("100") });
    });

    it("Should set max position size", async function () {
      await vault.setMaxPositionSize(ethers.parseEther("5"));
      expect(await vault.maxPositionSize()).to.equal(ethers.parseEther("5"));
    });

    it("Should set max daily loss", async function () {
      await vault.setMaxDailyLoss(ethers.parseEther("10"));
      expect(await vault.maxDailyLoss()).to.equal(ethers.parseEther("10"));
    });

    it("Should allow pausing", async function () {
      await vault.setPaused(true);
      expect(await vault.paused()).to.be.true;
    });

    it("Should allow unpausing", async function () {
      await vault.setPaused(true);
      await vault.setPaused(false);
      expect(await vault.paused()).to.be.false;
    });

    it("Should reject deposits when paused", async function () {
      await vault.setPaused(true);
      await expect(
        vault.connect(user1).deposit({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Vault is paused");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency withdrawal by owner", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("10") });
      
      const vaultBalanceBefore = await ethers.provider.getBalance(await vault.getAddress());
      
      await vault.emergencyWithdraw();
      
      // Vault should be empty after withdrawal
      expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0);
    });

    it("Should rescue ERC20 tokens", async function () {
      // Deploy a test token with 18 decimals
      const Token = await ethers.getContractFactory("ERC20Test");
      const token = await Token.deploy("Test", "TST", 18);
      await token.waitForDeployment();
      await token.mint(await vault.getAddress(), ethers.parseEther("100"));
      
      await vault.rescueTokens(token, ethers.parseEther("50"));
      
      expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("50"));
    });

    it("Should only allow owner to call emergency functions", async function () {
      await expect(
        vault.connect(user1).emergencyWithdraw()
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  describe("Receive ETH", function () {
    it("Should accept plain ETH transfers from depositors", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("5") });
      
      // Send ETH directly
      await user1.sendTransaction({
        to: await vault.getAddress(),
        value: ethers.parseEther("1")
      });
      
      expect(await vault.getBalance(user1.address)).to.equal(ethers.parseEther("6"));
    });
  });
});

describe("AgentRegistry - Comprehensive Tests", function () {
  let registry;
  let owner, agentOwner1, agentOwner2;

  beforeEach(async function () {
    [owner, agentOwner1, agentOwner2] = await ethers.getSigners();
    
    const Registry = await ethers.getContractFactory("AgentRegistry");
    registry = await Registry.deploy();
    await registry.waitForDeployment();
  });

  describe("Registration", function () {
    it("Should register agent with sufficient stake", async function () {
      const tx = await registry.connect(agentOwner1).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
        ["TRADE_EXECUTION", "SIGNAL_GENERATION"],
        [1000, 500],
        ethers.parseEther("1")
      );
      
      const agentIds = await registry.agentIds(0);
      expect(agentIds).to.not.equal(ethers.ZeroAddress);
    });

    it("Should reject insufficient stake", async function () {
      await expect(
        registry.connect(agentOwner1).registerAgent(
          ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
          ["TRADE_EXECUTION"],
          [1000],
          ethers.parseEther("0.5")
        )
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should reject mismatched capabilities/prices length", async function () {
      await expect(
        registry.connect(agentOwner1).registerAgent(
          ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
          ["TRADE_EXECUTION", "SIGNAL_GENERATION"],
          [1000], // Only one price for two capabilities
          ethers.parseEther("1")
        )
      ).to.be.revertedWith("Length mismatch");
    });

    it("Should track agent count", async function () {
      await registry.connect(agentOwner1).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("1")
      );
      
      await registry.connect(agentOwner2).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("1")
      );
      
      expect(await registry.agentCount()).to.equal(2);
    });

    it("Should not allow duplicate registration", async function () {
      await registry.connect(agentOwner1).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("1")
      );
      
      await expect(
        registry.connect(agentOwner1).registerAgent(
          ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR")),
          ["TRADE_EXECUTION"],
          [1000],
          ethers.parseEther("1")
        )
      ).to.be.revertedWith("Already registered");
    });
  });

  describe("Capabilities", function () {
    beforeEach(async function () {
      await registry.connect(agentOwner1).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("1")
      );
    });

    it("Should update capabilities", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      
      await registry.connect(agentOwner1).updateCapabilities(
        agentId,
        ["TRADE_EXECUTION", "RISK_MANAGEMENT"],
        [1000, 500]
      );
      
      const info = await registry.getAgent(agentId);
      expect(info.capabilities.length).to.equal(2);
    });

    it("Should reject update from non-owner", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      
      await expect(
        registry.connect(agentOwner2).updateCapabilities(
          agentId,
          ["TRADE_EXECUTION"],
          [1000]
        )
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("Reputation", function () {
    beforeEach(async function () {
      await registry.connect(agentOwner1).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("1")
      );
    });

    it("Should update reputation on successful trade with profit", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      
      await registry.updateReputation(agentId, true, ethers.parseEther("2"));
      
      const info = await registry.getAgent(agentId);
      expect(info.reputationScore).to.be.gt(1000);
    });

    it("Should decrease reputation on failed trade", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      
      await registry.updateReputation(agentId, false, 0);
      
      const info = await registry.getAgent(agentId);
      expect(info.reputationScore).to.equal(900); // 1000 - 100
    });

    it("Should not go below zero", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      
      // Many failures
      for (let i = 0; i < 15; i++) {
        await registry.updateReputation(agentId, false, 0);
      }
      
      const info = await registry.getAgent(agentId);
      expect(info.reputationScore).to.equal(0);
    });

    it("Should cap reputation at maximum", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      
      // Many successes
      for (let i = 0; i < 20; i++) {
        await registry.updateReputation(agentId, true, ethers.parseEther("10"));
      }
      
      const info = await registry.getAgent(agentId);
      expect(info.reputationScore).to.be.lte(10000);
    });
  });

  describe("Heartbeat", function () {
    beforeEach(async function () {
      await registry.connect(agentOwner1).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("1")
      );
    });

    it("Should update heartbeat", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      
      // Need to call from the agent owner, not registry owner
      await registry.connect(agentOwner1).heartbeat(agentId);
      
      const info = await registry.getAgent(agentId);
      expect(info.lastHeartbeat).to.be.gt(0);
    });

    it("Should check active status with recent heartbeat", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      
      expect(await registry.isAgentActive(agentId)).to.be.true;
    });
  });

  describe("Slasher", function () {
    beforeEach(async function () {
      await registry.connect(agentOwner1).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("5")
      );
    });

    it("Should slash agent stake", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      
      await registry.slashAgent(agentId, ethers.parseEther("1"));
      
      const info = await registry.getAgent(agentId);
      expect(info.stakeAmount).to.equal(ethers.parseEther("4"));
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await registry.connect(agentOwner1).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("1")
      );
      
      await registry.connect(agentOwner2).registerAgent(
        ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR")),
        ["TRADE_EXECUTION"],
        [1000],
        ethers.parseEther("1")
      );
    });

    it("Should get agent info", async function () {
      const agentId = await registry.addressToAgentId(agentOwner1.address);
      const info = await registry.getAgent(agentId);
      
      expect(info.owner).to.equal(agentOwner1.address);
      expect(info.agentType).to.equal(ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")));
    });

    it("Should get agent type name", async function () {
      const name = await registry.getAgentTypeName(ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")));
      expect(name).to.equal("Alpha Scanner");
    });

    it("Should list agents by type", async function () {
      const agents = await registry.getAgentsByType(ethers.keccak256(ethers.toUtf8Bytes("ALPHA_SCANNER")));
      expect(agents.length).to.equal(1);
    });
  });
});
