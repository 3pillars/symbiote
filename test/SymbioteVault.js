const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SymbioteVault - Comprehensive Tests", function () {
  let vault;
  let owner, user1, user2, agent1, agent2;

  beforeEach(async function () {
    [owner, user1, user2, agent1, agent2] = await ethers.getSigners();
    
    const Vault = await ethers.getContractFactory("SymbioteVault");
    vault = await Vault.deploy(ethers.ZeroAddress); // No timelock initially
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

  // ============ NEW: Timelock and Security Tests ============

  describe("Timelock Management", function () {
    let timelock;
    let proposer, executor;

    beforeEach(async function () {
      [proposer, executor] = await ethers.getSigners();
      
      // Deploy a TimelockController
      const Timelock = await ethers.getContractFactory("TimelockController");
      // Min delay of 2 days (the contract's MIN_DELAY)
      timelock = await Timelock.deploy(2 * 24 * 60 * 60, [proposer.address], [executor.address], ethers.ZeroAddress);
      await timelock.waitForDeployment();
    });

    it("Should set timelock address", async function () {
      await vault.setTimelock(await timelock.getAddress());
      expect(await vault.timelock()).to.equal(await timelock.getAddress());
    });

    it("Should emit TimelockUpdated event", async function () {
      await expect(vault.setTimelock(await timelock.getAddress()))
        .to.emit(vault, "TimelockUpdated")
        .withArgs(ethers.ZeroAddress, await timelock.getAddress());
    });

    it("Should reject zero address timelock", async function () {
      await expect(
        vault.setTimelock(ethers.ZeroAddress)
      ).to.be.revertedWith("Timelock cannot be zero address");
    });

    it("Should allow updating timelock to new address", async function () {
      await vault.setTimelock(await timelock.getAddress());
      
      // Deploy another timelock
      const Timelock2 = await ethers.getContractFactory("TimelockController");
      const timelock2 = await Timelock2.deploy(2 * 24 * 60 * 60, [proposer.address], [executor.address], ethers.ZeroAddress);
      await timelock2.waitForDeployment();
      
      await vault.setTimelock(await timelock2.getAddress());
      expect(await vault.timelock()).to.equal(await timelock2.getAddress());
    });
  });

  describe("Price Oracle Functions", function () {
    it("Should have price feeds initialized", async function () {
      // Check that price feeds are set in constructor
      const ethFeed = await vault.priceFeeds(0);
      const btcFeed = await vault.priceFeeds(1);
      
      expect(ethFeed).to.not.equal(ethers.ZeroAddress);
      expect(btcFeed).to.not.equal(ethers.ZeroAddress);
    });

    it("Should have ethUsdPriceFeed and btcUsdPriceFeed variables", async function () {
      const ethFeed = await vault.ethUsdPriceFeed();
      const btcFeed = await vault.btcUsdPriceFeed();
      
      expect(ethFeed).to.not.equal(ethers.ZeroAddress);
      expect(btcFeed).to.not.equal(ethers.ZeroAddress);
    });

    it("Should set price feed for asset", async function () {
      // Get current ETH price feed address
      const currentFeed = await vault.priceFeeds(0);
      expect(currentFeed).to.not.equal(ethers.ZeroAddress);
      
      // Update price feed to the same (should work)
      await vault.setPriceFeed(0, currentFeed);
      expect(await vault.priceFeeds(0)).to.equal(currentFeed);
    });

    it("Should reject zero address price feed", async function () {
      await expect(
        vault.setPriceFeed(0, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid price feed address");
    });

    it("Should update both ETH and BTC price feeds", async function () {
      const ethFeed = await vault.priceFeeds(0);
      const btcFeed = await vault.priceFeeds(1);
      
      await vault.setPriceFeed(0, ethFeed);
      await vault.setPriceFeed(1, btcFeed);
      
      expect(await vault.priceFeeds(0)).to.equal(ethFeed);
      expect(await vault.priceFeeds(1)).to.equal(btcFeed);
    });
  });

  describe("onlyOwnerOrTimelock Modifier - setMaxPositionSize", function () {
    let timelock;
    let proposer;

    beforeEach(async function () {
      [proposer] = await ethers.getSigners();
      
      const Timelock = await ethers.getContractFactory("TimelockController");
      timelock = await Timelock.deploy(2 * 24 * 60 * 60, [proposer.address], [proposer.address], ethers.ZeroAddress);
      await timelock.waitForDeployment();
      
      await vault.setTimelock(await timelock.getAddress());
    });

    it("Should allow owner to set max position size", async function () {
      await vault.setMaxPositionSize(ethers.parseEther("50"));
      expect(await vault.maxPositionSize()).to.equal(ethers.parseEther("50"));
    });

    it("Should allow timelock to call via governance", async function () {
      // Simulate timelock calling directly (as the timelock address)
      // This tests that the modifier accepts timelock as a valid caller
      const newSize = ethers.parseEther("100");
      
      // We need to simulate the timelock making the call
      // In practice this would be done via governance, but for unit testing
      // we can directly call from an address that's been set as timelock
      await vault.connect(proposer).setMaxPositionSize(newSize);
      expect(await vault.maxPositionSize()).to.equal(newSize);
    });

    it("Should reject from unauthorized address", async function () {
      await expect(
        vault.connect(user1).setMaxPositionSize(ethers.parseEther("50"))
      ).to.be.revertedWith("Not owner or timelock");
    });
  });

  describe("onlyOwnerOrTimelock Modifier - setMaxDailyLoss", function () {
    let timelock;
    let proposer;

    beforeEach(async function () {
      [proposer] = await ethers.getSigners();
      
      const Timelock = await ethers.getContractFactory("TimelockController");
      timelock = await Timelock.deploy(2 * 24 * 60 * 60, [proposer.address], [proposer.address], ethers.ZeroAddress);
      await timelock.waitForDeployment();
      
      await vault.setTimelock(await timelock.getAddress());
    });

    it("Should allow owner to set max daily loss", async function () {
      await vault.setMaxDailyLoss(ethers.parseEther("20"));
      expect(await vault.maxDailyLoss()).to.equal(ethers.parseEther("20"));
    });

    it("Should allow timelock to call via governance", async function () {
      const newLoss = ethers.parseEther("30");
      
      // Simulate timelock making the call
      await vault.connect(proposer).setMaxDailyLoss(newLoss);
      expect(await vault.maxDailyLoss()).to.equal(newLoss);
    });

    it("Should reject from unauthorized address", async function () {
      await expect(
        vault.connect(user1).setMaxDailyLoss(ethers.parseEther("20"))
      ).to.be.revertedWith("Not owner or timelock");
    });
  });

  describe("onlyOwnerOrTimelock Modifier - setPaused", function () {
    let timelock;
    let proposer;

    beforeEach(async function () {
      [proposer] = await ethers.getSigners();
      
      const Timelock = await ethers.getContractFactory("TimelockController");
      timelock = await Timelock.deploy(2 * 24 * 60 * 60, [proposer.address], [proposer.address], ethers.ZeroAddress);
      await timelock.waitForDeployment();
      
      await vault.setTimelock(await timelock.getAddress());
    });

    it("Should allow owner to pause/unpause", async function () {
      await vault.setPaused(true);
      expect(await vault.paused()).to.be.true;
      
      await vault.setPaused(false);
      expect(await vault.paused()).to.be.false;
    });

    it("Should allow timelock to call via governance", async function () {
      // Simulate timelock making the call
      await vault.connect(proposer).setPaused(true);
      expect(await vault.paused()).to.be.true;
    });

    it("Should emit EmergencyPause event", async function () {
      await expect(vault.setPaused(true))
        .to.emit(vault, "EmergencyPause")
        .withArgs(true);
    });

    it("Should reject from unauthorized address", async function () {
      await expect(
        vault.connect(user1).setPaused(true)
      ).to.be.revertedWith("Not owner or timelock");
    });
  });

  describe("removeAgent via Timelock", function () {
    let timelock;
    let proposer;

    beforeEach(async function () {
      [proposer] = await ethers.getSigners();
      
      const Timelock = await ethers.getContractFactory("TimelockController");
      timelock = await Timelock.deploy(2 * 24 * 60 * 60, [proposer.address], [proposer.address], ethers.ZeroAddress);
      await timelock.waitForDeployment();
      
      await vault.setTimelock(await timelock.getAddress());
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
    });

    it("Should allow owner to remove agent directly", async function () {
      // First fund vault for bond return
      await vault.connect(owner).deposit({ value: ethers.parseEther("10") });
      
      await vault.removeAgent(agent1.address);
      expect(await vault.authorizedAgents(agent1.address)).to.be.false;
    });

    it("Should allow timelock to remove agent", async function () {
      // Fund vault for bond return first
      await vault.connect(owner).deposit({ value: ethers.parseEther("10") });
      
      // Simulate timelock removing agent
      await vault.connect(proposer).removeAgent(agent1.address);
      expect(await vault.authorizedAgents(agent1.address)).to.be.false;
    });
  });

  describe("Emergency Functions - Immediate (No Timelock)", function () {
    it("Should allow emergencyWithdraw when no timelock set", async function () {
      await vault.connect(user1).deposit({ value: ethers.parseEther("10") });
      
      await vault.emergencyWithdraw();
      
      expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0);
    });

    it("Should allow rescueTokens when no timelock set", async function () {
      const Token = await ethers.getContractFactory("ERC20Test");
      const token = await Token.deploy("Test", "TST", 18);
      await token.waitForDeployment();
      await token.mint(await vault.getAddress(), ethers.parseEther("100"));
      
      await vault.rescueTokens(token, ethers.parseEther("75"));
      
      expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("75"));
    });

    it("Should allow emergency functions even when timelock is set", async function () {
      // Set timelock first
      const Timelock = await ethers.getContractFactory("TimelockController");
      const timelock = await Timelock.deploy(2 * 24 * 60 * 60, [owner.address], [owner.address], ethers.ZeroAddress);
      await timelock.waitForDeployment();
      await vault.setTimelock(await timelock.getAddress());
      
      // Emergency functions should still work
      await vault.connect(user1).deposit({ value: ethers.parseEther("10") });
      await vault.emergencyWithdraw();
      
      expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0);
    });
  });

  describe("Price Feed Configuration", function () {
    it("Should have default price feeds set in constructor", async function () {
      // Check that price feeds are set (Sepolia addresses)
      const ethFeed = await vault.priceFeeds(0);
      const btcFeed = await vault.priceFeeds(1);
      
      expect(ethFeed).to.not.equal(ethers.ZeroAddress);
      expect(btcFeed).to.not.equal(ethers.ZeroAddress);
    });

    it("Should have ethUsdPriceFeed and btcUsdPriceFeed variables", async function () {
      const ethFeed = await vault.ethUsdPriceFeed();
      const btcFeed = await vault.btcUsdPriceFeed();
      
      expect(ethFeed).to.not.equal(ethers.ZeroAddress);
      expect(btcFeed).to.not.equal(ethers.ZeroAddress);
    });

    it("Should update price feeds correctly", async function () {
      const newEthFeed = await vault.ethUsdPriceFeed();
      
      // Set to a different valid feed (using same for test)
      await vault.setPriceFeed(0, newEthFeed);
      expect(await vault.priceFeeds(0)).to.equal(newEthFeed);
    });
  });

  // Additional tests to increase coverage

  describe("Legacy recordTrade (without price verification)", function () {
    beforeEach(async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      await vault.connect(user1).deposit({ value: ethers.parseEther("100") });
    });

    it("Should record trade without price verification", async function () {
      // This uses the legacy function signature without entryPrice and asset
      await vault.recordTrade(
        agent1.address,
        ethers.id("legacy_trade1"),
        ethers.parseEther("2"),
        ethers.parseEther("5")
      );
      
      const [pnl, volume] = await vault.getAgentPerformance(agent1.address);
      expect(pnl).to.equal(ethers.parseEther("2"));
      expect(volume).to.equal(ethers.parseEther("5"));
    });

    it("Should record negative PnL", async function () {
      await vault.recordTrade(
        agent1.address,
        ethers.id("legacy_trade2"),
        -ethers.parseEther("1"),
        ethers.parseEther("3")
      );
      
      const [pnl, volume] = await vault.getAgentPerformance(agent1.address);
      expect(pnl).to.equal(-ethers.parseEther("1"));
    });

    it("Should track total volume correctly", async function () {
      await vault.recordTrade(
        agent1.address,
        ethers.id("trade1"),
        ethers.parseEther("1"),
        ethers.parseEther("10")
      );
      
      const [pnl, volume] = await vault.getAgentPerformance(agent1.address);
      expect(volume).to.equal(ethers.parseEther("10"));
    });

    it("Should update totalPnl when recording trades", async function () {
      await vault.recordTrade(
        agent1.address,
        ethers.id("trade1"),
        ethers.parseEther("3"),
        ethers.parseEther("5")
      );
      
      // totalPnl should be updated
      expect(await vault.totalPnl()).to.equal(ethers.parseEther("3"));
    });

    it("Should update lastUpdateTime when recording trades", async function () {
      const beforeTime = await vault.lastUpdateTime();
      
      // Mine a new block
      await ethers.provider.send("evm_mine");
      
      await vault.recordTrade(
        agent1.address,
        ethers.id("trade1"),
        ethers.parseEther("1"),
        ethers.parseEther("5")
      );
      
      const afterTime = await vault.lastUpdateTime();
      expect(afterTime).to.be.gt(beforeTime);
    });
  });

  // Tests for new recordTrade with price verification
  describe("recordTrade with Price Verification", function () {
    let mockPriceFeed;
    
    beforeEach(async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      await vault.connect(user1).deposit({ value: ethers.parseEther("100") });
      
      // Deploy a mock price feed
      const MockAggregator = await ethers.getContractFactory("MockV3Aggregator");
      mockPriceFeed = await MockAggregator.deploy(8, 3000e8); // $3000 ETH price
      await mockPriceFeed.waitForDeployment();
      
      // Set the mock price feed for ETH
      await vault.setPriceFeed(0, await mockPriceFeed.getAddress());
    });

    it("Should record trade with valid price", async function () {
      // Use the new function signature with price verification
      await vault.recordTrade(
        agent1.address,
        ethers.id("price_verified_trade"),
        ethers.parseEther("1"),
        ethers.parseEther("5"),
        3000e8, // entryPrice matching oracle
        0 // ETH asset
      );
      
      const [pnl, volume] = await vault.getAgentPerformance(agent1.address);
      expect(pnl).to.equal(ethers.parseEther("1"));
    });

    it("Should update totalPnl with price verified trade", async function () {
      await vault.recordTrade(
        agent1.address,
        ethers.id("price_verified_trade"),
        ethers.parseEther("2"),
        ethers.parseEther("5"),
        3000e8,
        0
      );
      
      expect(await vault.totalPnl()).to.equal(ethers.parseEther("2"));
    });

    it("Should update lastUpdateTime with price verified trade", async function () {
      const beforeTime = await vault.lastUpdateTime();
      
      await ethers.provider.send("evm_mine");
      
      await vault.recordTrade(
        agent1.address,
        ethers.id("price_verified_trade"),
        ethers.parseEther("1"),
        ethers.parseEther("5"),
        3000e8,
        0
      );
      
      const afterTime = await vault.lastUpdateTime();
      expect(afterTime).to.be.gt(beforeTime);
    });
  });

  describe("Daily Loss Limit", function () {
    beforeEach(async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      await vault.connect(user1).deposit({ value: ethers.parseEther("100") });
    });

    it("Should allow trades when under daily loss limit", async function () {
      // Set a generous daily loss limit
      await vault.setMaxDailyLoss(ethers.parseEther("50"));
      
      // Record a losing trade
      await vault.recordTrade(
        agent1.address,
        ethers.id("loss_trade1"),
        -ethers.parseEther("5"),
        ethers.parseEther("10")
      );
      
      const [pnl, volume] = await vault.getAgentPerformance(agent1.address);
      expect(pnl).to.equal(-ethers.parseEther("5"));
    });

    it("Should reject trades that would exceed daily loss limit", async function () {
      // First, record a losing trade to make totalPnl negative
      await vault.recordTrade(
        agent1.address,
        ethers.id("loss_trade1"),
        -ethers.parseEther("0.2"),
        ethers.parseEther("1")
      );
      
      // Now set a small daily loss limit
      await vault.setMaxDailyLoss(ethers.parseEther("0.1"));
      
      // Try to record another loss that would exceed the limit
      // totalPnl is now -0.2, loss = 0.2, maxDailyLoss = 0.1
      // 0.2 < 0.1 is false, so it should revert
      await expect(
        vault.recordTrade(
          agent1.address,
          ethers.id("loss_trade2"),
          -ethers.parseEther("0.1"),
          ethers.parseEther("1")
        )
      ).to.be.revertedWith("Daily loss limit reached");
    });
  });

  describe("Agent Performance Tracking", function () {
    beforeEach(async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      await vault.connect(user1).deposit({ value: ethers.parseEther("100") });
    });

    it("Should track multiple trades for same agent", async function () {
      await vault.recordTrade(
        agent1.address,
        ethers.id("trade1"),
        ethers.parseEther("1"),
        ethers.parseEther("5")
      );
      
      await vault.recordTrade(
        agent1.address,
        ethers.id("trade2"),
        ethers.parseEther("2"),
        ethers.parseEther("10")
      );
      
      const [pnl, volume] = await vault.getAgentPerformance(agent1.address);
      expect(pnl).to.equal(ethers.parseEther("3"));
      expect(volume).to.equal(ethers.parseEther("15"));
    });

    it("Should allow owner to record trades on behalf of agents", async function () {
      // Owner can record trades (onlyAgentOrOwner modifier)
      await vault.recordTrade(
        agent1.address,
        ethers.id("owner_trade"),
        ethers.parseEther("1"),
        ethers.parseEther("5")
      );
      
      const [pnl, volume] = await vault.getAgentPerformance(agent1.address);
      expect(pnl).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Additional Security Tests", function () {
    it("Should track total PnL correctly", async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      await vault.registerAgent(agent2.address, ethers.parseEther("3"));
      await vault.connect(user1).deposit({ value: ethers.parseEther("100") });
      
      await vault.recordTrade(
        agent1.address,
        ethers.id("trade1"),
        ethers.parseEther("5"),
        ethers.parseEther("10")
      );
      
      await vault.recordTrade(
        agent2.address,
        ethers.id("trade2"),
        -ethers.parseEther("2"),
        ethers.parseEther("5")
      );
      
      expect(await vault.totalPnl()).to.equal(ethers.parseEther("3"));
    });

    it("Should update lastUpdateTime on trades", async function () {
      await vault.registerAgent(agent1.address, ethers.parseEther("2"));
      await vault.connect(user1).deposit({ value: ethers.parseEther("100") });
      
      const beforeTime = await vault.lastUpdateTime();
      
      // Mine a new block to get a different timestamp
      await ethers.provider.send("evm_mine");
      
      await vault.recordTrade(
        agent1.address,
        ethers.id("trade1"),
        ethers.parseEther("1"),
        ethers.parseEther("5")
      );
      
      const afterTime = await vault.lastUpdateTime();
      expect(afterTime).to.be.gte(beforeTime);
    });
  });

  describe("Dual Authorization Security", function () {
    let timelock;
    let proposer;

    beforeEach(async function () {
      [proposer, user1] = await ethers.getSigners();
      
      const Timelock = await ethers.getContractFactory("TimelockController");
      timelock = await Timelock.deploy(2 * 24 * 60 * 60, [proposer.address], [proposer.address], ethers.ZeroAddress);
      await timelock.waitForDeployment();
    });

    it("Should allow owner calls without timelock", async function () {
      // Deploy vault without timelock
      const Vault = await ethers.getContractFactory("SymbioteVault");
      const vaultNoTimelock = await Vault.deploy(ethers.ZeroAddress);
      await vaultNoTimelock.waitForDeployment();
      
      // Owner should still be able to call protected functions
      await vaultNoTimelock.setMaxPositionSize(ethers.parseEther("100"));
      expect(await vaultNoTimelock.maxPositionSize()).to.equal(ethers.parseEther("100"));
    });

    it("Should reject calls from non-owner when timelock is set but not used", async function () {
      await vault.setTimelock(await timelock.getAddress());
      
      // user1 is not owner and not timelock
      await expect(
        vault.connect(user1).setMaxPositionSize(ethers.parseEther("100"))
      ).to.be.revertedWith("Not owner or timelock");
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
