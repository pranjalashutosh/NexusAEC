"use strict";
/**
 * @nexus-aec/email-providers - Unified Inbox Service
 *
 * Aggregates email from multiple providers (Outlook, Gmail) into a single
 * unified timeline. Normalizes data, handles pagination, and merges results.
 */
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiedInboxService = void 0;
var email_provider_1 = require("../interfaces/email-provider");
// =============================================================================
// Unified Inbox Service
// =============================================================================
/**
 * UnifiedInboxService - Aggregates multiple email providers into one interface
 *
 * @example
 * ```typescript
 * const outlook = new OutlookAdapter({ userId: 'user1', tokens: outlookTokens });
 * const gmail = new GmailAdapter({ userId: 'user1', tokens: gmailTokens });
 *
 * const inbox = new UnifiedInboxService([outlook, gmail]);
 *
 * // Fetch all unread from both providers, merged by date
 * const unread = await inbox.fetchUnread();
 *
 * // Operations route to correct provider based on ID
 * await inbox.markRead(['outlook:msg-1', 'gmail:msg-2']);
 * ```
 */
var UnifiedInboxService = /** @class */ (function () {
    function UnifiedInboxService(providers, config) {
        if (config === void 0) { config = {}; }
        var _a, _b, _c, _d;
        this.providers = new Map();
        for (var _i = 0, providers_1 = providers; _i < providers_1.length; _i++) {
            var provider = providers_1[_i];
            this.providers.set(provider.source, provider);
        }
        this.config = {
            defaultPageSize: (_a = config.defaultPageSize) !== null && _a !== void 0 ? _a : 25,
            maxConcurrent: (_b = config.maxConcurrent) !== null && _b !== void 0 ? _b : 3,
            requestTimeoutMs: (_c = config.requestTimeoutMs) !== null && _c !== void 0 ? _c : 30000,
            continueOnError: (_d = config.continueOnError) !== null && _d !== void 0 ? _d : true,
        };
        this.syncStatus = this.createInitialSyncStatus();
    }
    // ===========================================================================
    // Provider Management
    // ===========================================================================
    /**
     * Add a provider to the unified inbox
     */
    UnifiedInboxService.prototype.addProvider = function (provider) {
        this.providers.set(provider.source, provider);
        this.syncStatus.providers[provider.source] = { state: 'idle' };
    };
    /**
     * Remove a provider from the unified inbox
     */
    UnifiedInboxService.prototype.removeProvider = function (source) {
        this.providers.delete(source);
        delete this.syncStatus.providers[source];
    };
    /**
     * Get a specific provider
     */
    UnifiedInboxService.prototype.getProvider = function (source) {
        return this.providers.get(source);
    };
    /**
     * Get all active provider sources
     */
    UnifiedInboxService.prototype.getActiveSources = function () {
        return Array.from(this.providers.keys());
    };
    /**
     * Check if a specific provider is connected
     */
    UnifiedInboxService.prototype.hasProvider = function (source) {
        return this.providers.has(source);
    };
    // ===========================================================================
    // Connection & Status
    // ===========================================================================
    /**
     * Test connection to all providers
     */
    UnifiedInboxService.prototype.testConnections = function () {
        return __awaiter(this, void 0, void 0, function () {
            var results;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        results = {};
                        return [4 /*yield*/, Promise.all(Array.from(this.providers.entries()).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var _c, _d;
                                var source = _b[0], provider = _b[1];
                                return __generator(this, function (_e) {
                                    switch (_e.label) {
                                        case 0:
                                            _c = results;
                                            _d = source;
                                            return [4 /*yield*/, provider.testConnection()];
                                        case 1:
                                            _c[_d] = _e.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, results];
                }
            });
        });
    };
    /**
     * Get unified sync status
     */
    UnifiedInboxService.prototype.getSyncStatus = function () {
        // Update provider statuses
        for (var _i = 0, _a = this.providers; _i < _a.length; _i++) {
            var _b = _a[_i], source = _b[0], provider = _b[1];
            this.syncStatus.providers[source] = provider.getSyncStatus();
        }
        // Calculate overall state
        var states = Object.values(this.syncStatus.providers);
        if (states.some(function (s) { return s.state === 'syncing'; })) {
            this.syncStatus.state = 'syncing';
        }
        else if (states.some(function (s) { return s.state === 'error'; })) {
            this.syncStatus.state = 'error';
        }
        else if (states.every(function (s) { return s.state === 'synced'; })) {
            this.syncStatus.state = 'synced';
        }
        else {
            this.syncStatus.state = 'idle';
        }
        return __assign({}, this.syncStatus);
    };
    /**
     * Disconnect all providers
     */
    UnifiedInboxService.prototype.disconnectAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.all(Array.from(this.providers.values()).map(function (p) { return p.disconnect(); }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ===========================================================================
    // Email Operations
    // ===========================================================================
    /**
     * Fetch unread emails from all providers, merged by date
     */
    UnifiedInboxService.prototype.fetchUnread = function (filters, pagination) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.fetchEmailsFromAll(function (provider, pag) { return provider.fetchUnread(filters, pag); }, pagination)];
            });
        });
    };
    /**
     * Fetch threads from all providers, merged by date
     */
    UnifiedInboxService.prototype.fetchThreads = function (filters, pagination) {
        return __awaiter(this, void 0, void 0, function () {
            var pageSize, results, errors, items;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        pageSize = (_a = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !== null && _a !== void 0 ? _a : this.config.defaultPageSize;
                        results = [];
                        errors = [];
                        // Fetch from all providers
                        return [4 /*yield*/, Promise.all(Array.from(this.providers.entries()).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var response, error_1;
                                var source = _b[0], provider = _b[1];
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            _c.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, provider.fetchThreads(filters, { pageSize: pageSize })];
                                        case 1:
                                            response = _c.sent();
                                            results.push.apply(results, response.items);
                                            return [3 /*break*/, 3];
                                        case 2:
                                            error_1 = _c.sent();
                                            if (!this.config.continueOnError)
                                                throw error_1;
                                            errors.push({ source: source, error: this.getErrorMessage(error_1) });
                                            return [3 /*break*/, 3];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        // Fetch from all providers
                        _b.sent();
                        // Sort by last updated date (newest first)
                        results.sort(function (a, b) {
                            return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
                        });
                        items = results.slice(0, pageSize);
                        return [2 /*return*/, __assign({ items: items, errors: errors }, (results.length > pageSize && { nextPageToken: 'has-more' }))];
                }
            });
        });
    };
    /**
     * Fetch a single email by ID (routes to correct provider)
     */
    UnifiedInboxService.prototype.fetchEmail = function (emailId) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = this.getProviderForId(emailId);
                if (!provider)
                    return [2 /*return*/, null];
                return [2 /*return*/, provider.fetchEmail(emailId)];
            });
        });
    };
    /**
     * Fetch a single thread by ID (routes to correct provider)
     */
    UnifiedInboxService.prototype.fetchThread = function (threadId) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = this.getProviderForId(threadId);
                if (!provider)
                    return [2 /*return*/, null];
                return [2 /*return*/, provider.fetchThread(threadId)];
            });
        });
    };
    /**
     * Fetch all messages in a thread
     */
    UnifiedInboxService.prototype.fetchThreadMessages = function (threadId) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = this.getProviderForId(threadId);
                if (!provider)
                    return [2 /*return*/, []];
                return [2 /*return*/, provider.fetchThreadMessages(threadId)];
            });
        });
    };
    /**
     * Mark emails as read (routes to correct providers)
     */
    UnifiedInboxService.prototype.markRead = function (emailIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.routeToProviders(emailIds, function (provider, ids) { return provider.markRead(ids); })];
            });
        });
    };
    /**
     * Mark emails as unread (routes to correct providers)
     */
    UnifiedInboxService.prototype.markUnread = function (emailIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.routeToProviders(emailIds, function (provider, ids) { return provider.markUnread(ids); })];
            });
        });
    };
    /**
     * Flag/star emails (routes to correct providers)
     */
    UnifiedInboxService.prototype.flagEmails = function (emailIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.routeToProviders(emailIds, function (provider, ids) { return provider.flagEmails(ids); })];
            });
        });
    };
    /**
     * Unflag/unstar emails (routes to correct providers)
     */
    UnifiedInboxService.prototype.unflagEmails = function (emailIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.routeToProviders(emailIds, function (provider, ids) { return provider.unflagEmails(ids); })];
            });
        });
    };
    /**
     * Move emails to folder (must all be from same provider)
     */
    UnifiedInboxService.prototype.moveToFolder = function (emailIds, folderId) {
        return __awaiter(this, void 0, void 0, function () {
            var parsed, provider, providerEmailIds;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        parsed = (0, email_provider_1.parseStandardId)(folderId);
                        if (!parsed) {
                            throw new Error('Invalid folder ID');
                        }
                        provider = this.providers.get(parsed.source);
                        if (!provider) {
                            throw new Error("No provider for source: ".concat(parsed.source));
                        }
                        providerEmailIds = emailIds.filter(function (id) {
                            var p = (0, email_provider_1.parseStandardId)(id);
                            return (p === null || p === void 0 ? void 0 : p.source) === parsed.source;
                        });
                        return [4 /*yield*/, provider.moveToFolder(providerEmailIds, folderId)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Apply labels to emails (routes to correct providers)
     */
    UnifiedInboxService.prototype.applyLabels = function (emailIds, labelIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.routeToProviders(emailIds, function (provider, ids) {
                        return provider.applyLabels(ids, labelIds);
                    })];
            });
        });
    };
    /**
     * Remove labels from emails (routes to correct providers)
     */
    UnifiedInboxService.prototype.removeLabels = function (emailIds, labelIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.routeToProviders(emailIds, function (provider, ids) {
                        return provider.removeLabels(ids, labelIds);
                    })];
            });
        });
    };
    /**
     * Archive emails (routes to correct providers)
     */
    UnifiedInboxService.prototype.archiveEmails = function (emailIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.routeToProviders(emailIds, function (provider, ids) { return provider.archiveEmails(ids); })];
            });
        });
    };
    /**
     * Delete emails (routes to correct providers)
     */
    UnifiedInboxService.prototype.deleteEmails = function (emailIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.routeToProviders(emailIds, function (provider, ids) { return provider.deleteEmails(ids); })];
            });
        });
    };
    // ===========================================================================
    // Draft Operations
    // ===========================================================================
    /**
     * Fetch drafts from all providers
     */
    UnifiedInboxService.prototype.fetchDrafts = function (pagination) {
        return __awaiter(this, void 0, void 0, function () {
            var pageSize, results, errors;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        pageSize = (_a = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !== null && _a !== void 0 ? _a : this.config.defaultPageSize;
                        results = [];
                        errors = [];
                        return [4 /*yield*/, Promise.all(Array.from(this.providers.entries()).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var response, error_2;
                                var source = _b[0], provider = _b[1];
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            _c.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, provider.fetchDrafts({ pageSize: pageSize })];
                                        case 1:
                                            response = _c.sent();
                                            results.push.apply(results, response.items);
                                            return [3 /*break*/, 3];
                                        case 2:
                                            error_2 = _c.sent();
                                            if (!this.config.continueOnError)
                                                throw error_2;
                                            errors.push({ source: source, error: this.getErrorMessage(error_2) });
                                            return [3 /*break*/, 3];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        _b.sent();
                        // Sort by modified date (newest first)
                        results.sort(function (a, b) {
                            return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
                        });
                        return [2 /*return*/, __assign({ items: results.slice(0, pageSize), errors: errors }, (results.length > pageSize && { nextPageToken: 'has-more' }))];
                }
            });
        });
    };
    /**
     * Fetch a single draft by ID
     */
    UnifiedInboxService.prototype.fetchDraft = function (draftId) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = this.getProviderForId(draftId);
                if (!provider)
                    return [2 /*return*/, null];
                return [2 /*return*/, provider.fetchDraft(draftId)];
            });
        });
    };
    /**
     * Create a draft in specified provider (defaults to Outlook)
     */
    UnifiedInboxService.prototype.createDraft = function (input, preferredSource) {
        return __awaiter(this, void 0, void 0, function () {
            var source, provider;
            return __generator(this, function (_a) {
                source = preferredSource;
                if (!source || !this.providers.has(source)) {
                    source = this.providers.has('OUTLOOK') ? 'OUTLOOK' : this.getActiveSources()[0];
                }
                if (!source) {
                    throw new Error('No email provider available');
                }
                provider = this.providers.get(source);
                if (!provider) {
                    throw new Error("Provider not found: ".concat(source));
                }
                return [2 /*return*/, provider.createDraft(input)];
            });
        });
    };
    /**
     * Update a draft (routes to correct provider)
     */
    UnifiedInboxService.prototype.updateDraft = function (draftId, input) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = this.getProviderForId(draftId);
                if (!provider) {
                    throw new Error('Provider not found for draft');
                }
                return [2 /*return*/, provider.updateDraft(draftId, input)];
            });
        });
    };
    /**
     * Delete a draft (routes to correct provider)
     */
    UnifiedInboxService.prototype.deleteDraft = function (draftId) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        provider = this.getProviderForId(draftId);
                        if (!provider)
                            return [2 /*return*/];
                        return [4 /*yield*/, provider.deleteDraft(draftId)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Send a draft (routes to correct provider)
     */
    UnifiedInboxService.prototype.sendDraft = function (draftId) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = this.getProviderForId(draftId);
                if (!provider) {
                    throw new Error('Provider not found for draft');
                }
                return [2 /*return*/, provider.sendDraft(draftId)];
            });
        });
    };
    // ===========================================================================
    // Folder Operations
    // ===========================================================================
    /**
     * Fetch folders from all providers
     */
    UnifiedInboxService.prototype.fetchFolders = function () {
        return __awaiter(this, void 0, void 0, function () {
            var folders, errors;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        folders = [];
                        errors = [];
                        return [4 /*yield*/, Promise.all(Array.from(this.providers.entries()).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var result, error_3;
                                var source = _b[0], provider = _b[1];
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            _c.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, provider.fetchFolders()];
                                        case 1:
                                            result = _c.sent();
                                            folders.push.apply(folders, result);
                                            return [3 /*break*/, 3];
                                        case 2:
                                            error_3 = _c.sent();
                                            if (!this.config.continueOnError)
                                                throw error_3;
                                            errors.push({ source: source, error: this.getErrorMessage(error_3) });
                                            return [3 /*break*/, 3];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, { folders: folders, errors: errors }];
                }
            });
        });
    };
    /**
     * Create a folder in specified provider
     */
    UnifiedInboxService.prototype.createFolder = function (name, source, parentId) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = this.providers.get(source);
                if (!provider) {
                    throw new Error("Provider not found: ".concat(source));
                }
                return [2 /*return*/, provider.createFolder(name, parentId)];
            });
        });
    };
    /**
     * Delete a folder (routes to correct provider)
     */
    UnifiedInboxService.prototype.deleteFolder = function (folderId) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        provider = this.getProviderForId(folderId);
                        if (!provider)
                            return [2 /*return*/];
                        return [4 /*yield*/, provider.deleteFolder(folderId)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ===========================================================================
    // Calendar Operations
    // ===========================================================================
    /**
     * Fetch calendar events from all providers
     */
    UnifiedInboxService.prototype.fetchCalendarEvents = function (filters, pagination) {
        return __awaiter(this, void 0, void 0, function () {
            var pageSize, results, errors;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        pageSize = (_a = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !== null && _a !== void 0 ? _a : this.config.defaultPageSize;
                        results = [];
                        errors = [];
                        return [4 /*yield*/, Promise.all(Array.from(this.providers.entries()).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var response, error_4;
                                var source = _b[0], provider = _b[1];
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            _c.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, provider.fetchCalendarEvents(filters, { pageSize: pageSize })];
                                        case 1:
                                            response = _c.sent();
                                            results.push.apply(results, response.items);
                                            return [3 /*break*/, 3];
                                        case 2:
                                            error_4 = _c.sent();
                                            if (!this.config.continueOnError)
                                                throw error_4;
                                            errors.push({ source: source, error: this.getErrorMessage(error_4) });
                                            return [3 /*break*/, 3];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        _b.sent();
                        // Sort by start time
                        results.sort(function (a, b) {
                            return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
                        });
                        return [2 /*return*/, {
                                items: results.slice(0, pageSize * 2), // Allow more calendar events
                                errors: errors,
                            }];
                }
            });
        });
    };
    /**
     * Fetch a single calendar event by ID
     */
    UnifiedInboxService.prototype.fetchCalendarEvent = function (eventId) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = this.getProviderForId(eventId);
                if (!provider)
                    return [2 /*return*/, null];
                return [2 /*return*/, provider.fetchCalendarEvent(eventId)];
            });
        });
    };
    // ===========================================================================
    // Contact Operations
    // ===========================================================================
    /**
     * Fetch contacts from all providers
     */
    UnifiedInboxService.prototype.fetchContacts = function (pagination) {
        return __awaiter(this, void 0, void 0, function () {
            var pageSize, results, errors, seen, deduped;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        pageSize = (_a = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !== null && _a !== void 0 ? _a : this.config.defaultPageSize;
                        results = [];
                        errors = [];
                        return [4 /*yield*/, Promise.all(Array.from(this.providers.entries()).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var response, error_5;
                                var source = _b[0], provider = _b[1];
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            _c.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, provider.fetchContacts({ pageSize: pageSize })];
                                        case 1:
                                            response = _c.sent();
                                            results.push.apply(results, response.items);
                                            return [3 /*break*/, 3];
                                        case 2:
                                            error_5 = _c.sent();
                                            if (!this.config.continueOnError)
                                                throw error_5;
                                            errors.push({ source: source, error: this.getErrorMessage(error_5) });
                                            return [3 /*break*/, 3];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        _b.sent();
                        // Sort by display name
                        results.sort(function (a, b) { return a.displayName.localeCompare(b.displayName); });
                        seen = new Set();
                        deduped = results.filter(function (c) {
                            var _a;
                            var primaryEmail = (_a = c.emailAddresses[0]) === null || _a === void 0 ? void 0 : _a.email;
                            if (!primaryEmail || seen.has(primaryEmail))
                                return false;
                            seen.add(primaryEmail);
                            return true;
                        });
                        return [2 /*return*/, __assign({ items: deduped.slice(0, pageSize), errors: errors }, (deduped.length > pageSize && { nextPageToken: 'has-more' }))];
                }
            });
        });
    };
    /**
     * Search contacts across all providers
     */
    UnifiedInboxService.prototype.searchContacts = function (query_1) {
        return __awaiter(this, arguments, void 0, function (query, limit) {
            var results, errors, queryLower, seen, contacts;
            var _this = this;
            if (limit === void 0) { limit = 10; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        results = [];
                        errors = [];
                        return [4 /*yield*/, Promise.all(Array.from(this.providers.entries()).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var contacts_1, error_6;
                                var source = _b[0], provider = _b[1];
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            _c.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, provider.searchContacts(query, limit)];
                                        case 1:
                                            contacts_1 = _c.sent();
                                            results.push.apply(results, contacts_1);
                                            return [3 /*break*/, 3];
                                        case 2:
                                            error_6 = _c.sent();
                                            if (!this.config.continueOnError)
                                                throw error_6;
                                            errors.push({ source: source, error: this.getErrorMessage(error_6) });
                                            return [3 /*break*/, 3];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        _a.sent();
                        queryLower = query.toLowerCase();
                        results.sort(function (a, b) {
                            var aStarts = a.displayName.toLowerCase().startsWith(queryLower) ? 0 : 1;
                            var bStarts = b.displayName.toLowerCase().startsWith(queryLower) ? 0 : 1;
                            if (aStarts !== bStarts)
                                return aStarts - bStarts;
                            return a.displayName.localeCompare(b.displayName);
                        });
                        seen = new Set();
                        contacts = results.filter(function (c) {
                            var _a;
                            var primaryEmail = (_a = c.emailAddresses[0]) === null || _a === void 0 ? void 0 : _a.email;
                            if (!primaryEmail || seen.has(primaryEmail))
                                return false;
                            seen.add(primaryEmail);
                            return true;
                        }).slice(0, limit);
                        return [2 /*return*/, { contacts: contacts, errors: errors }];
                }
            });
        });
    };
    // ===========================================================================
    // Private Helpers
    // ===========================================================================
    /**
     * Fetch emails from all providers and merge by date
     */
    UnifiedInboxService.prototype.fetchEmailsFromAll = function (fetcher, pagination) {
        return __awaiter(this, void 0, void 0, function () {
            var pageSize, results, errors, items;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        pageSize = (_a = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !== null && _a !== void 0 ? _a : this.config.defaultPageSize;
                        results = [];
                        errors = [];
                        return [4 /*yield*/, Promise.all(Array.from(this.providers.entries()).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var response, error_7;
                                var source = _b[0], provider = _b[1];
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            _c.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, fetcher(provider, { pageSize: pageSize })];
                                        case 1:
                                            response = _c.sent();
                                            results.push.apply(results, response.items);
                                            return [3 /*break*/, 3];
                                        case 2:
                                            error_7 = _c.sent();
                                            if (!this.config.continueOnError)
                                                throw error_7;
                                            errors.push({ source: source, error: this.getErrorMessage(error_7) });
                                            return [3 /*break*/, 3];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        _b.sent();
                        // Sort by received date (newest first)
                        results.sort(function (a, b) {
                            return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
                        });
                        items = results.slice(0, pageSize);
                        this.updateSyncStatus(items.length, errors);
                        return [2 /*return*/, __assign(__assign({ items: items, errors: errors }, (results.length > pageSize && { nextPageToken: 'has-more' })), { totalCount: results.length })];
                }
            });
        });
    };
    /**
     * Route IDs to their respective providers and execute operation
     */
    UnifiedInboxService.prototype.routeToProviders = function (ids, operation) {
        return __awaiter(this, void 0, void 0, function () {
            var byProvider, _i, ids_1, id, parsed, results, errors;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        byProvider = new Map();
                        for (_i = 0, ids_1 = ids; _i < ids_1.length; _i++) {
                            id = ids_1[_i];
                            parsed = (0, email_provider_1.parseStandardId)(id);
                            if (!parsed)
                                continue;
                            if (!byProvider.has(parsed.source)) {
                                byProvider.set(parsed.source, []);
                            }
                            byProvider.get(parsed.source).push(id);
                        }
                        results = [];
                        errors = [];
                        // Execute on each provider
                        return [4 /*yield*/, Promise.all(Array.from(byProvider.entries()).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var provider, result, error_8;
                                var source = _b[0], providerIds = _b[1];
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            provider = this.providers.get(source);
                                            if (!provider) {
                                                errors.push({ source: source, error: 'Provider not found' });
                                                return [2 /*return*/];
                                            }
                                            _c.label = 1;
                                        case 1:
                                            _c.trys.push([1, 3, , 4]);
                                            return [4 /*yield*/, operation(provider, providerIds)];
                                        case 2:
                                            result = _c.sent();
                                            if (result !== undefined) {
                                                results.push(result);
                                            }
                                            return [3 /*break*/, 4];
                                        case 3:
                                            error_8 = _c.sent();
                                            if (!this.config.continueOnError)
                                                throw error_8;
                                            errors.push({ source: source, error: this.getErrorMessage(error_8) });
                                            return [3 /*break*/, 4];
                                        case 4: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        // Execute on each provider
                        _a.sent();
                        return [2 /*return*/, {
                                items: results,
                                errors: errors,
                                allSucceeded: errors.length === 0,
                            }];
                }
            });
        });
    };
    /**
     * Get provider for a standard ID
     */
    UnifiedInboxService.prototype.getProviderForId = function (id) {
        var parsed = (0, email_provider_1.parseStandardId)(id);
        if (!parsed)
            return undefined;
        return this.providers.get(parsed.source);
    };
    /**
     * Create initial sync status
     */
    UnifiedInboxService.prototype.createInitialSyncStatus = function () {
        var providers = {};
        for (var _i = 0, _a = this.providers.keys(); _i < _a.length; _i++) {
            var source = _a[_i];
            providers[source] = { state: 'idle' };
        }
        return {
            state: 'idle',
            providers: providers,
            errors: [],
        };
    };
    /**
     * Update unified sync status
     */
    UnifiedInboxService.prototype.updateSyncStatus = function (itemsSynced, errors) {
        this.syncStatus = {
            state: errors.length > 0 ? 'error' : 'synced',
            providers: this.syncStatus.providers,
            lastSyncAt: new Date().toISOString(),
            totalItemsSynced: itemsSynced,
            errors: errors,
        };
    };
    /**
     * Get error message from unknown error
     */
    UnifiedInboxService.prototype.getErrorMessage = function (error) {
        if (error instanceof Error)
            return error.message;
        return String(error);
    };
    return UnifiedInboxService;
}());
exports.UnifiedInboxService = UnifiedInboxService;
