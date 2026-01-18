"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VipDetector = void 0;
/**
 * Normalize email address for comparison (lowercase, trim)
 */
function normalizeEmail(email) {
    return email.toLowerCase().trim();
}
/**
 * Check if email matches VIP list
 */
function findVipMatch(email, vipList) {
    var normalized = normalizeEmail(email);
    return vipList.find(function (vip) { return normalizeEmail(vip.email) === normalized; });
}
/**
 * Find contact by email
 */
function findContact(email, contacts) {
    var normalized = normalizeEmail(email);
    return contacts.find(function (contact) { return normalizeEmail(contact.email) === normalized; });
}
/**
 * Calculate days since last interaction
 */
function daysSinceInteraction(lastInteractionAt) {
    if (!lastInteractionAt) {
        return Infinity;
    }
    var now = new Date();
    var diffMs = now.getTime() - lastInteractionAt.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
/**
 * Check if job title indicates VIP status
 */
function hasVipJobTitle(jobTitle) {
    if (!jobTitle) {
        return false;
    }
    var vipTitles = [
        'ceo',
        'cto',
        'cfo',
        'coo',
        'president',
        'vice president',
        'vp',
        'director',
        'head of',
        'chief',
        'founder',
        'co-founder',
        'partner',
        'principal',
    ];
    var normalized = jobTitle.toLowerCase();
    return vipTitles.some(function (title) { return normalized.includes(title); });
}
/**
 * VipDetector class for detecting VIP senders and inferring importance
 *
 * Provides:
 * - Explicit VIP list matching
 * - Interaction frequency analysis
 * - Recency-based importance boosting
 * - Job title-based VIP detection
 *
 * @example
 * ```typescript
 * const detector = new VipDetector({
 *   vipList: userVips,
 *   contacts: userContacts,
 * });
 *
 * const result = detector.detectVip(email);
 * if (result.isVip) {
 *   console.log(`VIP detected with score: ${result.score}`);
 *   result.reasons.forEach(reason => {
 *     console.log(`- ${reason.description} (weight: ${reason.weight})`);
 *   });
 * }
 * ```
 */
var VipDetector = /** @class */ (function () {
    function VipDetector(config, options) {
        if (config === void 0) { config = {}; }
        if (options === void 0) { options = {}; }
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        this.vipList = (_a = config.vipList) !== null && _a !== void 0 ? _a : [];
        this.contacts = (_b = config.contacts) !== null && _b !== void 0 ? _b : [];
        this.options = {
            vipMatchWeight: (_c = options.vipMatchWeight) !== null && _c !== void 0 ? _c : 0.8,
            highInteractionThreshold: (_d = options.highInteractionThreshold) !== null && _d !== void 0 ? _d : 50,
            mediumInteractionThreshold: (_e = options.mediumInteractionThreshold) !== null && _e !== void 0 ? _e : 20,
            highInteractionWeight: (_f = options.highInteractionWeight) !== null && _f !== void 0 ? _f : 0.6,
            mediumInteractionWeight: (_g = options.mediumInteractionWeight) !== null && _g !== void 0 ? _g : 0.4,
            recencyBoostDays: (_h = options.recencyBoostDays) !== null && _h !== void 0 ? _h : 7,
            recencyBoostMultiplier: (_j = options.recencyBoostMultiplier) !== null && _j !== void 0 ? _j : 0.2,
        };
    }
    /**
     * Detect VIP status for an email sender
     */
    VipDetector.prototype.detectVip = function (email) {
        var _a, _b;
        var senderEmail = email.from.email;
        var reasons = [];
        var score = 0;
        // Check explicit VIP list
        var vipEntry = findVipMatch(senderEmail, this.vipList);
        if (vipEntry) {
            score += this.options.vipMatchWeight;
            reasons.push({
                type: 'explicit_vip',
                description: "Sender is in VIP list: ".concat((_a = vipEntry.name) !== null && _a !== void 0 ? _a : vipEntry.email),
                weight: this.options.vipMatchWeight,
            });
        }
        // Check contact information for interaction frequency
        var contact = findContact(senderEmail, this.contacts);
        if (contact) {
            var interactionCount = (_b = contact.interactionCount) !== null && _b !== void 0 ? _b : 0;
            // High interaction frequency
            if (interactionCount >= this.options.highInteractionThreshold) {
                score += this.options.highInteractionWeight;
                reasons.push({
                    type: 'high_interaction',
                    description: "High interaction frequency: ".concat(interactionCount, " interactions"),
                    weight: this.options.highInteractionWeight,
                });
            }
            // Medium interaction frequency
            else if (interactionCount >= this.options.mediumInteractionThreshold) {
                score += this.options.mediumInteractionWeight;
                reasons.push({
                    type: 'medium_interaction',
                    description: "Medium interaction frequency: ".concat(interactionCount, " interactions"),
                    weight: this.options.mediumInteractionWeight,
                });
            }
            // Recency boost
            var daysSince = daysSinceInteraction(contact.lastInteractionAt);
            if (daysSince <= this.options.recencyBoostDays) {
                var boost = this.options.recencyBoostMultiplier;
                score += boost;
                reasons.push({
                    type: 'recent_interaction',
                    description: "Recent interaction (".concat(daysSince, " days ago)"),
                    weight: boost,
                });
            }
            // Job title check
            if (hasVipJobTitle(contact.jobTitle)) {
                var titleWeight = 0.3;
                score += titleWeight;
                reasons.push({
                    type: 'job_title',
                    description: "VIP job title: ".concat(contact.jobTitle),
                    weight: titleWeight,
                });
            }
        }
        // Cap score at 1.0
        score = Math.min(score, 1.0);
        var result = {
            isVip: score >= 0.5, // Threshold for VIP status
            score: score,
            reasons: reasons,
        };
        if (vipEntry) {
            result.vipEntry = vipEntry;
        }
        if (contact) {
            result.contact = contact;
        }
        return result;
    };
    /**
     * Batch detect VIPs for multiple emails
     */
    VipDetector.prototype.detectVips = function (emails) {
        var results = new Map();
        for (var _i = 0, emails_1 = emails; _i < emails_1.length; _i++) {
            var email = emails_1[_i];
            var result = this.detectVip(email);
            results.set(email.id, result);
        }
        return results;
    };
    /**
     * Get VIP list
     */
    VipDetector.prototype.getVipList = function () {
        return __spreadArray([], this.vipList, true);
    };
    /**
     * Set VIP list
     */
    VipDetector.prototype.setVipList = function (vipList) {
        this.vipList = vipList;
    };
    /**
     * Add VIP to list
     */
    VipDetector.prototype.addVip = function (vip) {
        // Check if already exists
        var existing = findVipMatch(vip.email, this.vipList);
        if (!existing) {
            this.vipList.push(vip);
        }
    };
    /**
     * Remove VIP from list
     */
    VipDetector.prototype.removeVip = function (email) {
        var normalized = normalizeEmail(email);
        var index = this.vipList.findIndex(function (vip) { return normalizeEmail(vip.email) === normalized; });
        if (index !== -1) {
            this.vipList.splice(index, 1);
            return true;
        }
        return false;
    };
    /**
     * Get contacts
     */
    VipDetector.prototype.getContacts = function () {
        return __spreadArray([], this.contacts, true);
    };
    /**
     * Set contacts
     */
    VipDetector.prototype.setContacts = function (contacts) {
        this.contacts = contacts;
    };
    /**
     * Add or update contact
     */
    VipDetector.prototype.addOrUpdateContact = function (contact) {
        var existing = findContact(contact.email, this.contacts);
        if (existing) {
            // Update existing
            Object.assign(existing, contact);
        }
        else {
            // Add new
            this.contacts.push(contact);
        }
    };
    /**
     * Get detection options
     */
    VipDetector.prototype.getOptions = function () {
        return __assign({}, this.options);
    };
    /**
     * Update detection options
     */
    VipDetector.prototype.updateOptions = function (options) {
        this.options = __assign(__assign({}, this.options), options);
    };
    return VipDetector;
}());
exports.VipDetector = VipDetector;
