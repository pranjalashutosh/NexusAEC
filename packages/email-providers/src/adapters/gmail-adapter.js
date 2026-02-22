'use strict';
/**
 * @nexus-aec/email-providers - Gmail Adapter
 *
 * Implements EmailProvider interface using Google Gmail API.
 * Handles Gmail email, Google Calendar, and Google Contacts.
 *
 * @see https://developers.google.com/gmail/api/reference/rest
 */
var __assign =
  (this && this.__assign) ||
  function () {
    __assign =
      Object.assign ||
      function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
    return __assign.apply(this, arguments);
  };
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create((typeof Iterator === 'function' ? Iterator : Object).prototype);
    return (
      (g.next = verb(0)),
      (g['throw'] = verb(1)),
      (g['return'] = verb(2)),
      typeof Symbol === 'function' &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError('Generator is already executing.');
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y['return']
                  : op[0]
                    ? y['throw'] || ((t = y['return']) && t.call(y), 0)
                    : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
var __spreadArray =
  (this && this.__spreadArray) ||
  function (to, from, pack) {
    if (pack || arguments.length === 2)
      for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
    return to.concat(ar || Array.prototype.slice.call(from));
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.GmailAdapter = void 0;
var email_provider_1 = require('../interfaces/email-provider');
// =============================================================================
// Constants
// =============================================================================
var GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
var CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
var PEOPLE_API_BASE = 'https://people.googleapis.com/v1';
var DEFAULT_PAGE_SIZE = 25;
var MAX_PAGE_SIZE = 100;
// =============================================================================
// Gmail Adapter
// =============================================================================
/**
 * GmailAdapter - Google Gmail API implementation of EmailProvider
 */
var GmailAdapter = /** @class */ (function () {
  function GmailAdapter(config) {
    var _a;
    this.source = 'GMAIL';
    this.syncStatus = { state: 'idle' };
    this.userId = config.userId;
    this.accessToken = config.tokens.accessToken;
    this.gmailBase = (_a = config.apiEndpoint) !== null && _a !== void 0 ? _a : GMAIL_API_BASE;
    this.calendarBase = CALENDAR_API_BASE;
    this.peopleBase = PEOPLE_API_BASE;
  }
  /**
   * Update access token (called after refresh)
   */
  GmailAdapter.prototype.updateAccessToken = function (newToken) {
    this.accessToken = newToken;
  };
  // ===========================================================================
  // Connection & Lifecycle
  // ===========================================================================
  GmailAdapter.prototype.testConnection = function () {
    return __awaiter(this, void 0, void 0, function () {
      var error_1;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            _a.trys.push([0, 2, , 3]);
            return [4 /*yield*/, this.gmailRequest('/users/me/profile')];
          case 1:
            _a.sent();
            return [2 /*return*/, { connected: true }];
          case 2:
            error_1 = _a.sent();
            return [
              2 /*return*/,
              {
                connected: false,
                error: error_1 instanceof Error ? error_1.message : 'Connection failed',
              },
            ];
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.getSyncStatus = function () {
    return __assign({}, this.syncStatus);
  };
  GmailAdapter.prototype.disconnect = function () {
    return __awaiter(this, void 0, void 0, function () {
      return __generator(this, function (_a) {
        this.syncStatus = { state: 'idle' };
        return [2 /*return*/];
      });
    });
  };
  // ===========================================================================
  // Email Operations
  // ===========================================================================
  GmailAdapter.prototype.fetchUnread = function (filters, pagination) {
    return __awaiter(this, void 0, void 0, function () {
      var mergedFilters;
      return __generator(this, function (_a) {
        mergedFilters = __assign(__assign({}, filters), { unreadOnly: true });
        return [2 /*return*/, this.fetchEmails(mergedFilters, pagination)];
      });
    });
  };
  GmailAdapter.prototype.fetchThreads = function (filters, pagination) {
    return __awaiter(this, void 0, void 0, function () {
      var pageSize, queryParts, params, response, threads, _i, _a, threadRef, thread, error_2;
      var _b, _c;
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            this.updateSyncStatus('syncing');
            _d.label = 1;
          case 1:
            _d.trys.push([1, 7, , 8]);
            pageSize = Math.min(
              (_b = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !==
                null && _b !== void 0
                ? _b
                : DEFAULT_PAGE_SIZE,
              MAX_PAGE_SIZE
            );
            queryParts = this.buildSearchQuery(filters);
            params = new URLSearchParams({
              maxResults: pageSize.toString(),
            });
            if (queryParts.length > 0) {
              params.set('q', queryParts.join(' '));
            }
            if (pagination === null || pagination === void 0 ? void 0 : pagination.pageToken) {
              params.set('pageToken', pagination.pageToken);
            }
            return [4 /*yield*/, this.gmailRequest('/users/me/threads?'.concat(params.toString()))];
          case 2:
            response = _d.sent();
            threads = [];
            ((_i = 0), (_a = (_c = response.threads) !== null && _c !== void 0 ? _c : []));
            _d.label = 3;
          case 3:
            if (!(_i < _a.length)) return [3 /*break*/, 6];
            threadRef = _a[_i];
            return [
              4 /*yield*/,
              this.fetchThread((0, email_provider_1.createStandardId)('GMAIL', threadRef.id)),
            ];
          case 4:
            thread = _d.sent();
            if (thread) {
              threads.push(thread);
            }
            _d.label = 5;
          case 5:
            _i++;
            return [3 /*break*/, 3];
          case 6:
            this.updateSyncStatus('synced', threads.length);
            return [
              2 /*return*/,
              __assign(
                __assign(
                  { items: threads },
                  response.nextPageToken && { nextPageToken: response.nextPageToken }
                ),
                response.resultSizeEstimate !== undefined && {
                  totalCount: response.resultSizeEstimate,
                }
              ),
            ];
          case 7:
            error_2 = _d.sent();
            this.updateSyncStatus('error', undefined, this.getErrorMessage(error_2));
            throw this.wrapError(error_2, 'Failed to fetch threads');
          case 8:
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.fetchEmail = function (emailId) {
    return __awaiter(this, void 0, void 0, function () {
      var parsed, message, error_3;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            parsed = (0, email_provider_1.parseStandardId)(emailId);
            if (!parsed || parsed.source !== 'GMAIL') return [2 /*return*/, null];
            _a.label = 1;
          case 1:
            _a.trys.push([1, 3, , 4]);
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/messages/'.concat(parsed.providerId, '?format=full')),
            ];
          case 2:
            message = _a.sent();
            return [2 /*return*/, this.normalizeMessage(message)];
          case 3:
            error_3 = _a.sent();
            if (this.isNotFoundError(error_3)) return [2 /*return*/, null];
            throw this.wrapError(error_3, 'Failed to fetch email');
          case 4:
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.fetchThread = function (threadId) {
    return __awaiter(this, void 0, void 0, function () {
      var parsed,
        thread,
        messages,
        latestMessage,
        participantMap,
        _i,
        messages_1,
        msg,
        _a,
        _b,
        recipient,
        error_4;
      var _this = this;
      var _c;
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            parsed = (0, email_provider_1.parseStandardId)(threadId);
            if (!parsed || parsed.source !== 'GMAIL') return [2 /*return*/, null];
            _d.label = 1;
          case 1:
            _d.trys.push([1, 3, , 4]);
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/threads/'.concat(parsed.providerId, '?format=full')),
            ];
          case 2:
            thread = _d.sent();
            if (!((_c = thread.messages) === null || _c === void 0 ? void 0 : _c.length))
              return [2 /*return*/, null];
            messages = thread.messages.map(function (msg) {
              return _this.normalizeMessage(msg);
            });
            latestMessage = messages[messages.length - 1];
            participantMap = new Map();
            for (_i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
              msg = messages_1[_i];
              if (msg.from) participantMap.set(msg.from.email, msg.from);
              for (
                _a = 0, _b = __spreadArray(__spreadArray([], msg.to, true), msg.cc, true);
                _a < _b.length;
                _a++
              ) {
                recipient = _b[_a];
                participantMap.set(recipient.email, recipient);
              }
            }
            return [
              2 /*return*/,
              {
                id: threadId,
                source: 'GMAIL',
                providerThreadId: thread.id,
                subject: latestMessage.subject,
                participants: Array.from(participantMap.values()),
                messageCount: messages.length,
                messageIds: messages.map(function (m) {
                  return m.id;
                }),
                latestMessage: latestMessage,
                lastUpdatedAt: latestMessage.receivedAt,
                hasUnread: messages.some(function (m) {
                  return !m.isRead;
                }),
                snippet: latestMessage.bodyPreview,
                labels: latestMessage.labels,
              },
            ];
          case 3:
            error_4 = _d.sent();
            if (this.isNotFoundError(error_4)) return [2 /*return*/, null];
            throw this.wrapError(error_4, 'Failed to fetch thread');
          case 4:
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.fetchThreadMessages = function (threadId) {
    return __awaiter(this, void 0, void 0, function () {
      var thread, parsed, gmailThread;
      var _this = this;
      var _a;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            return [4 /*yield*/, this.fetchThread(threadId)];
          case 1:
            thread = _b.sent();
            if (!thread) return [2 /*return*/, []];
            parsed = (0, email_provider_1.parseStandardId)(threadId);
            if (!parsed) return [2 /*return*/, []];
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/threads/'.concat(parsed.providerId, '?format=full')),
            ];
          case 2:
            gmailThread = _b.sent();
            return [
              2 /*return*/,
              ((_a = gmailThread.messages) !== null && _a !== void 0 ? _a : []).map(function (msg) {
                return _this.normalizeMessage(msg);
              }),
            ];
        }
      });
    });
  };
  GmailAdapter.prototype.markRead = function (emailIds) {
    return __awaiter(this, void 0, void 0, function () {
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              this.batchModifyMessages(emailIds, { removeLabelIds: ['UNREAD'] }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.markUnread = function (emailIds) {
    return __awaiter(this, void 0, void 0, function () {
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [4 /*yield*/, this.batchModifyMessages(emailIds, { addLabelIds: ['UNREAD'] })];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.flagEmails = function (emailIds) {
    return __awaiter(this, void 0, void 0, function () {
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [4 /*yield*/, this.batchModifyMessages(emailIds, { addLabelIds: ['STARRED'] })];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.unflagEmails = function (emailIds) {
    return __awaiter(this, void 0, void 0, function () {
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              this.batchModifyMessages(emailIds, { removeLabelIds: ['STARRED'] }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.moveToFolder = function (emailIds, folderId) {
    return __awaiter(this, void 0, void 0, function () {
      var parsed, targetLabelId;
      var _a;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            parsed = (0, email_provider_1.parseStandardId)(folderId);
            targetLabelId =
              (_a = parsed === null || parsed === void 0 ? void 0 : parsed.providerId) !== null &&
              _a !== void 0
                ? _a
                : folderId;
            // Remove from INBOX, add to target label
            return [
              4 /*yield*/,
              this.batchModifyMessages(emailIds, {
                addLabelIds: [targetLabelId],
                removeLabelIds: ['INBOX'],
              }),
            ];
          case 1:
            // Remove from INBOX, add to target label
            _b.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.applyLabels = function (emailIds, labelIds) {
    return __awaiter(this, void 0, void 0, function () {
      var resolvedLabelIds;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            resolvedLabelIds = labelIds.map(function (id) {
              var _a;
              var parsed = (0, email_provider_1.parseStandardId)(id);
              return (_a = parsed === null || parsed === void 0 ? void 0 : parsed.providerId) !==
                null && _a !== void 0
                ? _a
                : id;
            });
            return [
              4 /*yield*/,
              this.batchModifyMessages(emailIds, { addLabelIds: resolvedLabelIds }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.removeLabels = function (emailIds, labelIds) {
    return __awaiter(this, void 0, void 0, function () {
      var resolvedLabelIds;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            resolvedLabelIds = labelIds.map(function (id) {
              var _a;
              var parsed = (0, email_provider_1.parseStandardId)(id);
              return (_a = parsed === null || parsed === void 0 ? void 0 : parsed.providerId) !==
                null && _a !== void 0
                ? _a
                : id;
            });
            return [
              4 /*yield*/,
              this.batchModifyMessages(emailIds, { removeLabelIds: resolvedLabelIds }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.archiveEmails = function (emailIds) {
    return __awaiter(this, void 0, void 0, function () {
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [4 /*yield*/, this.batchModifyMessages(emailIds, { removeLabelIds: ['INBOX'] })];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.deleteEmails = function (emailIds) {
    return __awaiter(this, void 0, void 0, function () {
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            // Move to trash
            return [4 /*yield*/, this.batchModifyMessages(emailIds, { addLabelIds: ['TRASH'] })];
          case 1:
            // Move to trash
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  // ===========================================================================
  // Draft Operations
  // ===========================================================================
  GmailAdapter.prototype.fetchDrafts = function (pagination) {
    return __awaiter(this, void 0, void 0, function () {
      var pageSize, params, response, drafts, _i, _a, draftRef, draft;
      var _b, _c;
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            pageSize = Math.min(
              (_b = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !==
                null && _b !== void 0
                ? _b
                : DEFAULT_PAGE_SIZE,
              MAX_PAGE_SIZE
            );
            params = new URLSearchParams({ maxResults: pageSize.toString() });
            if (pagination === null || pagination === void 0 ? void 0 : pagination.pageToken) {
              params.set('pageToken', pagination.pageToken);
            }
            return [4 /*yield*/, this.gmailRequest('/users/me/drafts?'.concat(params.toString()))];
          case 1:
            response = _d.sent();
            drafts = [];
            ((_i = 0), (_a = (_c = response.drafts) !== null && _c !== void 0 ? _c : []));
            _d.label = 2;
          case 2:
            if (!(_i < _a.length)) return [3 /*break*/, 5];
            draftRef = _a[_i];
            return [
              4 /*yield*/,
              this.fetchDraft((0, email_provider_1.createStandardId)('GMAIL', draftRef.id)),
            ];
          case 3:
            draft = _d.sent();
            if (draft) {
              drafts.push(draft);
            }
            _d.label = 4;
          case 4:
            _i++;
            return [3 /*break*/, 2];
          case 5:
            return [
              2 /*return*/,
              __assign(
                { items: drafts },
                response.nextPageToken && { nextPageToken: response.nextPageToken }
              ),
            ];
        }
      });
    });
  };
  GmailAdapter.prototype.fetchDraft = function (draftId) {
    return __awaiter(this, void 0, void 0, function () {
      var parsed, draft, error_5;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            parsed = (0, email_provider_1.parseStandardId)(draftId);
            if (!parsed || parsed.source !== 'GMAIL') return [2 /*return*/, null];
            _a.label = 1;
          case 1:
            _a.trys.push([1, 3, , 4]);
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/drafts/'.concat(parsed.providerId, '?format=full')),
            ];
          case 2:
            draft = _a.sent();
            return [2 /*return*/, this.normalizeDraft(draft)];
          case 3:
            error_5 = _a.sent();
            if (this.isNotFoundError(error_5)) return [2 /*return*/, null];
            throw this.wrapError(error_5, 'Failed to fetch draft');
          case 4:
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.createDraft = function (input) {
    return __awaiter(this, void 0, void 0, function () {
      var rawMessage, requestBody, parsed, draft, fullDraft;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            rawMessage = this.buildRawMessage(input);
            requestBody = {
              message: { raw: rawMessage },
            };
            if (input.threadId) {
              parsed = (0, email_provider_1.parseStandardId)(input.threadId);
              if (parsed) {
                requestBody['message'] = __assign(__assign({}, requestBody['message']), {
                  threadId: parsed.providerId,
                });
              }
            }
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/drafts', {
                method: 'POST',
                body: JSON.stringify(requestBody),
              }),
            ];
          case 1:
            draft = _a.sent();
            return [
              4 /*yield*/,
              this.fetchDraft((0, email_provider_1.createStandardId)('GMAIL', draft.id)),
            ];
          case 2:
            fullDraft = _a.sent();
            if (!fullDraft) {
              throw new email_provider_1.EmailProviderError(
                'Failed to fetch created draft',
                'GMAIL',
                'SERVER_ERROR'
              );
            }
            if (input.isPendingReview) {
              fullDraft.isPendingReview = true;
              if (input.reviewRationale) {
                fullDraft.reviewRationale = input.reviewRationale;
              }
            }
            return [2 /*return*/, fullDraft];
        }
      });
    });
  };
  GmailAdapter.prototype.updateDraft = function (draftId, input) {
    return __awaiter(this, void 0, void 0, function () {
      var parsed,
        existing,
        bodyText,
        bodyHtml,
        threadId,
        merged,
        rawMessage,
        requestBody,
        threadParsed,
        draft,
        fullDraft;
      var _a, _b, _c, _d, _e, _f, _g, _h;
      return __generator(this, function (_j) {
        switch (_j.label) {
          case 0:
            parsed = (0, email_provider_1.parseStandardId)(draftId);
            if (!parsed || parsed.source !== 'GMAIL') {
              throw new email_provider_1.EmailProviderError(
                'Invalid draft ID',
                'GMAIL',
                'INVALID_REQUEST'
              );
            }
            return [4 /*yield*/, this.fetchDraft(draftId)];
          case 1:
            existing = _j.sent();
            if (!existing) {
              throw new email_provider_1.EmailProviderError(
                'Draft not found',
                'GMAIL',
                'NOT_FOUND'
              );
            }
            bodyText = (_a = input.bodyText) !== null && _a !== void 0 ? _a : existing.bodyText;
            bodyHtml = (_b = input.bodyHtml) !== null && _b !== void 0 ? _b : existing.bodyHtml;
            threadId = existing.threadId;
            merged = __assign(
              __assign(
                __assign(
                  __assign(
                    __assign(
                      {
                        subject:
                          (_c = input.subject) !== null && _c !== void 0 ? _c : existing.subject,
                        to: (_d = input.to) !== null && _d !== void 0 ? _d : existing.to,
                      },
                      ((_e = input.cc) !== null && _e !== void 0 ? _e : existing.cc)
                        ? { cc: (_f = input.cc) !== null && _f !== void 0 ? _f : existing.cc }
                        : {}
                    ),
                    ((_g = input.bcc) !== null && _g !== void 0 ? _g : existing.bcc)
                      ? { bcc: (_h = input.bcc) !== null && _h !== void 0 ? _h : existing.bcc }
                      : {}
                  ),
                  bodyText && { bodyText: bodyText }
                ),
                bodyHtml && { bodyHtml: bodyHtml }
              ),
              threadId && { threadId: threadId }
            );
            rawMessage = this.buildRawMessage(merged);
            requestBody = {
              message: { raw: rawMessage },
            };
            if (existing.threadId) {
              threadParsed = (0, email_provider_1.parseStandardId)(existing.threadId);
              if (threadParsed) {
                requestBody['message'] = __assign(__assign({}, requestBody['message']), {
                  threadId: threadParsed.providerId,
                });
              }
            }
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/drafts/'.concat(parsed.providerId), {
                method: 'PUT',
                body: JSON.stringify(requestBody),
              }),
            ];
          case 2:
            draft = _j.sent();
            return [
              4 /*yield*/,
              this.fetchDraft((0, email_provider_1.createStandardId)('GMAIL', draft.id)),
            ];
          case 3:
            fullDraft = _j.sent();
            if (!fullDraft) {
              throw new email_provider_1.EmailProviderError(
                'Failed to fetch updated draft',
                'GMAIL',
                'SERVER_ERROR'
              );
            }
            if (input.isPendingReview !== undefined) {
              fullDraft.isPendingReview = input.isPendingReview;
            }
            if (input.reviewRationale !== undefined) {
              fullDraft.reviewRationale = input.reviewRationale;
            }
            return [2 /*return*/, fullDraft];
        }
      });
    });
  };
  GmailAdapter.prototype.deleteDraft = function (draftId) {
    return __awaiter(this, void 0, void 0, function () {
      var parsed;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            parsed = (0, email_provider_1.parseStandardId)(draftId);
            if (!parsed || parsed.source !== 'GMAIL') return [2 /*return*/];
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/drafts/'.concat(parsed.providerId), {
                method: 'DELETE',
              }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.sendDraft = function (draftId) {
    return __awaiter(this, void 0, void 0, function () {
      var parsed, result;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            parsed = (0, email_provider_1.parseStandardId)(draftId);
            if (!parsed || parsed.source !== 'GMAIL') {
              throw new email_provider_1.EmailProviderError(
                'Invalid draft ID',
                'GMAIL',
                'INVALID_REQUEST'
              );
            }
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/drafts/'.concat(parsed.providerId, '/send'), {
                method: 'POST',
              }),
            ];
          case 1:
            result = _a.sent();
            return [2 /*return*/, (0, email_provider_1.createStandardId)('GMAIL', result.id)];
        }
      });
    });
  };
  // ===========================================================================
  // Folder/Label Operations
  // ===========================================================================
  GmailAdapter.prototype.fetchFolders = function () {
    return __awaiter(this, void 0, void 0, function () {
      var response;
      var _this = this;
      var _a;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            return [4 /*yield*/, this.gmailRequest('/users/me/labels')];
          case 1:
            response = _b.sent();
            return [
              2 /*return*/,
              ((_a = response.labels) !== null && _a !== void 0 ? _a : []).map(function (label) {
                return _this.normalizeLabel(label);
              }),
            ];
        }
      });
    });
  };
  GmailAdapter.prototype.createFolder = function (name, parentId) {
    return __awaiter(this, void 0, void 0, function () {
      var labelName, label;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            labelName = parentId ? ''.concat(parentId, '/').concat(name) : name;
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/labels', {
                method: 'POST',
                body: JSON.stringify({ name: labelName }),
              }),
            ];
          case 1:
            label = _a.sent();
            return [2 /*return*/, this.normalizeLabel(label)];
        }
      });
    });
  };
  GmailAdapter.prototype.deleteFolder = function (folderId) {
    return __awaiter(this, void 0, void 0, function () {
      var parsed, targetId;
      var _a;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            parsed = (0, email_provider_1.parseStandardId)(folderId);
            targetId =
              (_a = parsed === null || parsed === void 0 ? void 0 : parsed.providerId) !== null &&
              _a !== void 0
                ? _a
                : folderId;
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/labels/'.concat(targetId), {
                method: 'DELETE',
              }),
            ];
          case 1:
            _b.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  // ===========================================================================
  // Calendar Operations
  // ===========================================================================
  GmailAdapter.prototype.fetchCalendarEvents = function (filters, pagination) {
    return __awaiter(this, void 0, void 0, function () {
      var pageSize, params, calendarId, response, events;
      var _this = this;
      var _a, _b, _c;
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            pageSize = Math.min(
              (_a = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !==
                null && _a !== void 0
                ? _a
                : DEFAULT_PAGE_SIZE,
              MAX_PAGE_SIZE
            );
            params = new URLSearchParams({
              timeMin: filters.timeMin.toISOString(),
              timeMax: filters.timeMax.toISOString(),
              maxResults: pageSize.toString(),
              singleEvents: 'true',
              orderBy: 'startTime',
            });
            if (pagination === null || pagination === void 0 ? void 0 : pagination.pageToken) {
              params.set('pageToken', pagination.pageToken);
            }
            if (filters.showCancelled) {
              params.set('showDeleted', 'true');
            }
            calendarId = (_b = filters.calendarId) !== null && _b !== void 0 ? _b : 'primary';
            return [
              4 /*yield*/,
              this.calendarRequest(
                '/calendars/'
                  .concat(encodeURIComponent(calendarId), '/events?')
                  .concat(params.toString())
              ),
            ];
          case 1:
            response = _d.sent();
            events = ((_c = response.items) !== null && _c !== void 0 ? _c : []).map(
              function (event) {
                return _this.normalizeCalendarEvent(event, calendarId);
              }
            );
            return [
              2 /*return*/,
              __assign(
                { items: events },
                response.nextPageToken && { nextPageToken: response.nextPageToken }
              ),
            ];
        }
      });
    });
  };
  GmailAdapter.prototype.fetchCalendarEvent = function (eventId) {
    return __awaiter(this, void 0, void 0, function () {
      var parsed, event_1, error_6;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            parsed = (0, email_provider_1.parseStandardId)(eventId);
            if (!parsed || parsed.source !== 'GMAIL') return [2 /*return*/, null];
            _a.label = 1;
          case 1:
            _a.trys.push([1, 3, , 4]);
            return [
              4 /*yield*/,
              this.calendarRequest('/calendars/primary/events/'.concat(parsed.providerId)),
            ];
          case 2:
            event_1 = _a.sent();
            return [2 /*return*/, this.normalizeCalendarEvent(event_1, 'primary')];
          case 3:
            error_6 = _a.sent();
            if (this.isNotFoundError(error_6)) return [2 /*return*/, null];
            throw this.wrapError(error_6, 'Failed to fetch calendar event');
          case 4:
            return [2 /*return*/];
        }
      });
    });
  };
  // ===========================================================================
  // Contact Operations
  // ===========================================================================
  GmailAdapter.prototype.fetchContacts = function (pagination) {
    return __awaiter(this, void 0, void 0, function () {
      var pageSize, params, response, contacts;
      var _this = this;
      var _a, _b;
      return __generator(this, function (_c) {
        switch (_c.label) {
          case 0:
            pageSize = Math.min(
              (_a = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !==
                null && _a !== void 0
                ? _a
                : DEFAULT_PAGE_SIZE,
              MAX_PAGE_SIZE
            );
            params = new URLSearchParams({
              personFields: 'names,emailAddresses,phoneNumbers,organizations,photos,metadata',
              pageSize: pageSize.toString(),
            });
            if (pagination === null || pagination === void 0 ? void 0 : pagination.pageToken) {
              params.set('pageToken', pagination.pageToken);
            }
            return [
              4 /*yield*/,
              this.peopleRequest('/people/me/connections?'.concat(params.toString())),
            ];
          case 1:
            response = _c.sent();
            contacts = ((_b = response.connections) !== null && _b !== void 0 ? _b : []).map(
              function (person) {
                return _this.normalizePerson(person);
              }
            );
            return [
              2 /*return*/,
              __assign(
                __assign(
                  { items: contacts },
                  response.nextPageToken && { nextPageToken: response.nextPageToken }
                ),
                response.totalPeople !== undefined && { totalCount: response.totalPeople }
              ),
            ];
        }
      });
    });
  };
  GmailAdapter.prototype.searchContacts = function (query_1) {
    return __awaiter(this, arguments, void 0, function (query, limit) {
      var params, response;
      var _this = this;
      var _a;
      if (limit === void 0) {
        limit = 10;
      }
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            params = new URLSearchParams({
              query: query,
              readMask: 'names,emailAddresses,phoneNumbers,organizations,photos',
              pageSize: limit.toString(),
            });
            return [
              4 /*yield*/,
              this.peopleRequest('/people:searchContacts?'.concat(params.toString())),
            ];
          case 1:
            response = _b.sent();
            return [
              2 /*return*/,
              ((_a = response.results) !== null && _a !== void 0 ? _a : []).map(function (r) {
                return _this.normalizePerson(r.person);
              }),
            ];
        }
      });
    });
  };
  // ===========================================================================
  // Private Helpers
  // ===========================================================================
  GmailAdapter.prototype.fetchEmails = function (filters, pagination) {
    return __awaiter(this, void 0, void 0, function () {
      var pageSize,
        queryParts,
        params,
        _i,
        _a,
        labelId,
        parsed,
        response,
        emails,
        _b,
        _c,
        msgRef,
        email,
        error_7;
      var _d, _e, _f, _g;
      return __generator(this, function (_h) {
        switch (_h.label) {
          case 0:
            this.updateSyncStatus('syncing');
            _h.label = 1;
          case 1:
            _h.trys.push([1, 7, , 8]);
            pageSize = Math.min(
              (_d = pagination === null || pagination === void 0 ? void 0 : pagination.pageSize) !==
                null && _d !== void 0
                ? _d
                : DEFAULT_PAGE_SIZE,
              MAX_PAGE_SIZE
            );
            queryParts = this.buildSearchQuery(filters);
            params = new URLSearchParams({
              maxResults: pageSize.toString(),
            });
            if (queryParts.length > 0) {
              params.set('q', queryParts.join(' '));
            }
            if (
              (_e = filters === null || filters === void 0 ? void 0 : filters.labelIds) === null ||
              _e === void 0
                ? void 0
                : _e.length
            ) {
              for (_i = 0, _a = filters.labelIds; _i < _a.length; _i++) {
                labelId = _a[_i];
                parsed = (0, email_provider_1.parseStandardId)(labelId);
                params.append(
                  'labelIds',
                  (_f = parsed === null || parsed === void 0 ? void 0 : parsed.providerId) !==
                    null && _f !== void 0
                    ? _f
                    : labelId
                );
              }
            }
            if (pagination === null || pagination === void 0 ? void 0 : pagination.pageToken) {
              params.set('pageToken', pagination.pageToken);
            }
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/messages?'.concat(params.toString())),
            ];
          case 2:
            response = _h.sent();
            emails = [];
            ((_b = 0), (_c = (_g = response.messages) !== null && _g !== void 0 ? _g : []));
            _h.label = 3;
          case 3:
            if (!(_b < _c.length)) return [3 /*break*/, 6];
            msgRef = _c[_b];
            return [
              4 /*yield*/,
              this.fetchEmail((0, email_provider_1.createStandardId)('GMAIL', msgRef.id)),
            ];
          case 4:
            email = _h.sent();
            if (email) {
              emails.push(email);
            }
            _h.label = 5;
          case 5:
            _b++;
            return [3 /*break*/, 3];
          case 6:
            this.updateSyncStatus('synced', emails.length);
            return [
              2 /*return*/,
              __assign(
                __assign(
                  { items: emails },
                  response.nextPageToken && { nextPageToken: response.nextPageToken }
                ),
                response.resultSizeEstimate !== undefined && {
                  totalCount: response.resultSizeEstimate,
                }
              ),
            ];
          case 7:
            error_7 = _h.sent();
            this.updateSyncStatus('error', undefined, this.getErrorMessage(error_7));
            throw this.wrapError(error_7, 'Failed to fetch emails');
          case 8:
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.buildSearchQuery = function (filters) {
    var queryParts = [];
    if (filters === null || filters === void 0 ? void 0 : filters.unreadOnly) {
      queryParts.push('is:unread');
    }
    if (filters === null || filters === void 0 ? void 0 : filters.flaggedOnly) {
      queryParts.push('is:starred');
    }
    if (filters === null || filters === void 0 ? void 0 : filters.hasAttachments) {
      queryParts.push('has:attachment');
    }
    if (filters === null || filters === void 0 ? void 0 : filters.from) {
      queryParts.push('from:'.concat(filters.from));
    }
    if (filters === null || filters === void 0 ? void 0 : filters.after) {
      queryParts.push('after:'.concat(Math.floor(filters.after.getTime() / 1000)));
    }
    if (filters === null || filters === void 0 ? void 0 : filters.before) {
      queryParts.push('before:'.concat(Math.floor(filters.before.getTime() / 1000)));
    }
    if (filters === null || filters === void 0 ? void 0 : filters.query) {
      queryParts.push(filters.query);
    }
    return queryParts;
  };
  GmailAdapter.prototype.batchModifyMessages = function (emailIds, modifications) {
    return __awaiter(this, void 0, void 0, function () {
      var ids;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            ids = emailIds
              .map(function (id) {
                var parsed = (0, email_provider_1.parseStandardId)(id);
                return (parsed === null || parsed === void 0 ? void 0 : parsed.source) === 'GMAIL'
                  ? parsed.providerId
                  : null;
              })
              .filter(function (id) {
                return id !== null;
              });
            if (ids.length === 0) return [2 /*return*/];
            return [
              4 /*yield*/,
              this.gmailRequest('/users/me/messages/batchModify', {
                method: 'POST',
                body: JSON.stringify(__assign({ ids: ids }, modifications)),
              }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  };
  GmailAdapter.prototype.buildRawMessage = function (input) {
    var _this = this;
    var _a, _b, _c;
    var lines = [];
    // Headers
    lines.push(
      'To: '.concat(
        input.to
          .map(function (r) {
            return _this.formatEmailAddress(r);
          })
          .join(', ')
      )
    );
    if ((_a = input.cc) === null || _a === void 0 ? void 0 : _a.length) {
      lines.push(
        'Cc: '.concat(
          input.cc
            .map(function (r) {
              return _this.formatEmailAddress(r);
            })
            .join(', ')
        )
      );
    }
    if ((_b = input.bcc) === null || _b === void 0 ? void 0 : _b.length) {
      lines.push(
        'Bcc: '.concat(
          input.bcc
            .map(function (r) {
              return _this.formatEmailAddress(r);
            })
            .join(', ')
        )
      );
    }
    lines.push('Subject: '.concat(input.subject));
    if (input.bodyHtml) {
      lines.push('Content-Type: text/html; charset=utf-8');
      lines.push('');
      lines.push(input.bodyHtml);
    } else {
      lines.push('Content-Type: text/plain; charset=utf-8');
      lines.push('');
      lines.push((_c = input.bodyText) !== null && _c !== void 0 ? _c : '');
    }
    var message = lines.join('\r\n');
    // Base64 URL encode
    if (typeof btoa !== 'undefined') {
      return btoa(unescape(encodeURIComponent(message)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } else {
      return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
  };
  GmailAdapter.prototype.formatEmailAddress = function (addr) {
    if (addr.name) {
      return '"'.concat(addr.name, '" <').concat(addr.email, '>');
    }
    return addr.email;
  };
  GmailAdapter.prototype.gmailRequest = function (endpoint_1) {
    return __awaiter(this, arguments, void 0, function (endpoint, options) {
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_a) {
        return [2 /*return*/, this.apiRequest(this.gmailBase, endpoint, options)];
      });
    });
  };
  GmailAdapter.prototype.calendarRequest = function (endpoint_1) {
    return __awaiter(this, arguments, void 0, function (endpoint, options) {
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_a) {
        return [2 /*return*/, this.apiRequest(this.calendarBase, endpoint, options)];
      });
    });
  };
  GmailAdapter.prototype.peopleRequest = function (endpoint_1) {
    return __awaiter(this, arguments, void 0, function (endpoint, options) {
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_a) {
        return [2 /*return*/, this.apiRequest(this.peopleBase, endpoint, options)];
      });
    });
  };
  GmailAdapter.prototype.apiRequest = function (baseUrl_1, endpoint_1) {
    return __awaiter(this, arguments, void 0, function (baseUrl, endpoint, options) {
      var url, response;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            url = endpoint.startsWith('http') ? endpoint : ''.concat(baseUrl).concat(endpoint);
            return [
              4 /*yield*/,
              fetch(
                url,
                __assign(__assign({}, options), {
                  headers: __assign(
                    {
                      Authorization: 'Bearer '.concat(this.accessToken),
                      'Content-Type': 'application/json',
                    },
                    options.headers
                  ),
                })
              ),
            ];
          case 1:
            response = _a.sent();
            if (!!response.ok) return [3 /*break*/, 3];
            return [4 /*yield*/, this.handleErrorResponse(response)];
          case 2:
            _a.sent();
            _a.label = 3;
          case 3:
            if (response.status === 204) {
              return [2 /*return*/, {}];
            }
            return [2 /*return*/, response.json()];
        }
      });
    });
  };
  GmailAdapter.prototype.handleErrorResponse = function (response) {
    return __awaiter(this, void 0, void 0, function () {
      var errorBody, errorMessage, code;
      var _a, _b, _c;
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            return [
              4 /*yield*/,
              response.json().catch(function () {
                return {};
              }),
            ];
          case 1:
            errorBody = _d.sent();
            errorMessage =
              (_c =
                (_b = (_a = errorBody.error) === null || _a === void 0 ? void 0 : _a.message) !==
                  null && _b !== void 0
                  ? _b
                  : errorBody.message) !== null && _c !== void 0
                ? _c
                : response.statusText;
            switch (response.status) {
              case 401:
                code = 'AUTH_EXPIRED';
                break;
              case 403:
                code = 'PERMISSION_DENIED';
                break;
              case 404:
                code = 'NOT_FOUND';
                break;
              case 429:
                code = 'RATE_LIMITED';
                break;
              default:
                code = response.status >= 500 ? 'SERVER_ERROR' : 'INVALID_REQUEST';
            }
            throw new email_provider_1.EmailProviderError(errorMessage, 'GMAIL', code, errorBody);
        }
      });
    });
  };
  GmailAdapter.prototype.normalizeMessage = function (msg) {
    var _a, _b, _c, _d, _e;
    var headers =
      (_b = (_a = msg.payload) === null || _a === void 0 ? void 0 : _a.headers) !== null &&
      _b !== void 0
        ? _b
        : [];
    var getHeader = function (name) {
      var _a, _b;
      return (_b =
        (_a = headers.find(function (h) {
          return h.name.toLowerCase() === name.toLowerCase();
        })) === null || _a === void 0
          ? void 0
          : _a.value) !== null && _b !== void 0
        ? _b
        : '';
    };
    var from = this.parseEmailAddress(getHeader('From'));
    var to = this.parseEmailAddresses(getHeader('To'));
    var cc = this.parseEmailAddresses(getHeader('Cc'));
    var bcc = this.parseEmailAddresses(getHeader('Bcc'));
    var replyTo = this.parseEmailAddresses(getHeader('Reply-To'));
    var _f = this.extractBody(msg.payload),
      bodyText = _f.bodyText,
      bodyHtml = _f.bodyHtml,
      attachments = _f.attachments;
    return __assign(
      __assign(
        __assign(
          __assign(
            __assign(
              __assign(
                __assign(
                  {
                    id: (0, email_provider_1.createStandardId)('GMAIL', msg.id),
                    source: 'GMAIL',
                    providerMessageId: msg.id,
                    threadId: (0, email_provider_1.createStandardId)('GMAIL', msg.threadId),
                    subject: getHeader('Subject'),
                    from: from !== null && from !== void 0 ? from : { email: '' },
                    to: to,
                    cc: cc,
                    bcc: bcc,
                    receivedAt: new Date(parseInt(msg.internalDate, 10)).toISOString(),
                    sentAt:
                      getHeader('Date') || new Date(parseInt(msg.internalDate, 10)).toISOString(),
                    bodyPreview: msg.snippet,
                  },
                  bodyText && { bodyText: bodyText }
                ),
                bodyHtml && { bodyHtml: bodyHtml }
              ),
              {
                isRead: !msg.labelIds.includes('UNREAD'),
                isFlagged: msg.labelIds.includes('STARRED'),
                hasAttachments: attachments.length > 0,
                attachments: attachments,
                folder:
                  (_d =
                    (_c = msg.labelIds.find(function (l) {
                      return l === 'INBOX';
                    })) !== null && _c !== void 0
                      ? _c
                      : msg.labelIds[0]) !== null && _d !== void 0
                    ? _d
                    : '',
                labels: msg.labelIds,
                importance: msg.labelIds.includes('IMPORTANT') ? 'high' : 'normal',
              }
            ),
            replyTo.length > 0 && { replyTo: replyTo }
          ),
          { internetMessageId: getHeader('Message-ID') }
        ),
        getHeader('In-Reply-To') && { inReplyTo: getHeader('In-Reply-To') }
      ),
      {
        references:
          (_e = getHeader('References')) === null || _e === void 0
            ? void 0
            : _e.split(/\s+/).filter(Boolean),
      }
    );
  };
  GmailAdapter.prototype.extractBody = function (part) {
    var _this = this;
    if (!part) {
      return { attachments: [] };
    }
    var bodyText;
    var bodyHtml;
    var attachments = [];
    var processPartRecursive = function (p) {
      var _a, _b;
      if (p.mimeType === 'text/plain' && p.body.data && !bodyText) {
        bodyText = _this.decodeBase64(p.body.data);
      } else if (p.mimeType === 'text/html' && p.body.data && !bodyHtml) {
        bodyHtml = _this.decodeBase64(p.body.data);
      } else if (p.filename && p.body.attachmentId) {
        attachments.push({
          id: p.body.attachmentId,
          name: p.filename,
          contentType: p.mimeType,
          size: p.body.size,
          isInline:
            (_b =
              (_a = p.headers) === null || _a === void 0
                ? void 0
                : _a.some(function (h) {
                    return (
                      h.name.toLowerCase() === 'content-disposition' && h.value.includes('inline')
                    );
                  })) !== null && _b !== void 0
              ? _b
              : false,
        });
      }
      if (p.parts) {
        for (var _i = 0, _c = p.parts; _i < _c.length; _i++) {
          var subPart = _c[_i];
          processPartRecursive(subPart);
        }
      }
    };
    processPartRecursive(part);
    return __assign(
      __assign(
        __assign({}, bodyText && { bodyText: bodyText }),
        bodyHtml && { bodyHtml: bodyHtml }
      ),
      { attachments: attachments }
    );
  };
  GmailAdapter.prototype.decodeBase64 = function (data) {
    // Gmail uses URL-safe base64
    var base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob !== 'undefined') {
      return decodeURIComponent(escape(atob(base64)));
    } else {
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
  };
  GmailAdapter.prototype.parseEmailAddress = function (value) {
    var _a;
    if (!value) return null;
    var trimmed = value.trim();
    // Common case: plain email address (no display name)
    if (!trimmed.includes('<') && !trimmed.includes('>')) {
      return { email: trimmed };
    }
    // Match: Name <email> or "Name" <email> or <email>
    var angleMatch = trimmed.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+@[^>]+)>$/);
    if (angleMatch) {
      var name_1 = (_a = angleMatch[1]) === null || _a === void 0 ? void 0 : _a.trim();
      return __assign({ email: angleMatch[2].trim() }, name_1 && { name: name_1 });
    }
    // Fallback: best-effort
    return { email: trimmed };
  };
  GmailAdapter.prototype.parseEmailAddresses = function (value) {
    if (!value) return [];
    // Split by comma, handling quoted names
    var addresses = [];
    var parts = value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
      var part = parts_1[_i];
      var addr = this.parseEmailAddress(part.trim());
      if (addr) {
        addresses.push(addr);
      }
    }
    return addresses;
  };
  GmailAdapter.prototype.normalizeDraft = function (draft) {
    var _a, _b;
    var message = draft.message;
    var headers =
      (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.headers) !== null &&
      _b !== void 0
        ? _b
        : [];
    var getHeader = function (name) {
      var _a, _b;
      return (_b =
        (_a = headers.find(function (h) {
          return h.name.toLowerCase() === name.toLowerCase();
        })) === null || _a === void 0
          ? void 0
          : _a.value) !== null && _b !== void 0
        ? _b
        : '';
    };
    var to = this.parseEmailAddresses(getHeader('To'));
    var cc = this.parseEmailAddresses(getHeader('Cc'));
    var bcc = this.parseEmailAddresses(getHeader('Bcc'));
    var _c = this.extractBody(message.payload),
      bodyText = _c.bodyText,
      bodyHtml = _c.bodyHtml,
      attachments = _c.attachments;
    var threadId = message.threadId
      ? (0, email_provider_1.createStandardId)('GMAIL', message.threadId)
      : undefined;
    return __assign(
      __assign(
        __assign(
          __assign(
            __assign(
              {
                id: (0, email_provider_1.createStandardId)('GMAIL', draft.id),
                source: 'GMAIL',
                providerDraftId: draft.id,
              },
              threadId && { threadId: threadId }
            ),
            { subject: getHeader('Subject'), to: to, cc: cc, bcc: bcc }
          ),
          bodyText && { bodyText: bodyText }
        ),
        bodyHtml && { bodyHtml: bodyHtml }
      ),
      {
        createdAt: new Date(parseInt(message.internalDate, 10)).toISOString(),
        modifiedAt: new Date(parseInt(message.internalDate, 10)).toISOString(),
        isPendingReview: false,
        attachments: attachments,
      }
    );
  };
  GmailAdapter.prototype.normalizeLabel = function (label) {
    var _a, _b;
    var systemTypeMap = {
      INBOX: 'inbox',
      SENT: 'sent',
      DRAFT: 'drafts',
      TRASH: 'trash',
      SPAM: 'spam',
    };
    var systemType = systemTypeMap[label.id];
    return __assign(
      {
        id: (0, email_provider_1.createStandardId)('GMAIL', label.id),
        source: 'GMAIL',
        providerId: label.id,
        name: label.name,
        totalCount: (_a = label.messagesTotal) !== null && _a !== void 0 ? _a : 0,
        unreadCount: (_b = label.messagesUnread) !== null && _b !== void 0 ? _b : 0,
        isSystem: label.type === 'system',
      },
      systemType && { systemType: systemType }
    );
  };
  GmailAdapter.prototype.normalizeCalendarEvent = function (event, calendarId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    var responseStatusMap = {
      accepted: 'accepted',
      declined: 'declined',
      tentative: 'tentative',
      needsAction: 'needsAction',
    };
    var isAllDay = !event.start.dateTime;
    var startTime =
      (_b = (_a = event.start.dateTime) !== null && _a !== void 0 ? _a : event.start.date) !==
        null && _b !== void 0
        ? _b
        : '';
    var endTime =
      (_d = (_c = event.end.dateTime) !== null && _c !== void 0 ? _c : event.end.date) !== null &&
      _d !== void 0
        ? _d
        : '';
    // Find online meeting URL
    var onlineMeetingUrl =
      (_e = event.hangoutLink) !== null && _e !== void 0
        ? _e
        : (_h =
              (_g =
                (_f = event.conferenceData) === null || _f === void 0 ? void 0 : _f.entryPoints) ===
                null || _g === void 0
                ? void 0
                : _g.find(function (e) {
                    return e.entryPointType === 'video';
                  })) === null || _h === void 0
          ? void 0
          : _h.uri;
    return __assign(
      __assign(
        __assign(
          __assign(
            __assign(
              __assign(
                {
                  id: (0, email_provider_1.createStandardId)('GMAIL', event.id),
                  source: 'GMAIL',
                  providerEventId: event.id,
                  title: event.summary,
                },
                event.description && { description: event.description }
              ),
              { startTime: startTime, endTime: endTime, isAllDay: isAllDay }
            ),
            event.location && { location: event.location }
          ),
          onlineMeetingUrl && { onlineMeetingUrl: onlineMeetingUrl }
        ),
        {
          organizer: __assign(
            { email: event.organizer.email },
            event.organizer.displayName && { name: event.organizer.displayName }
          ),
          attendees: ((_j = event.attendees) !== null && _j !== void 0 ? _j : []).map(function (a) {
            var _a, _b;
            return __assign(
              __assign({ email: a.email }, a.displayName && { name: a.displayName }),
              {
                responseStatus:
                  (_a = responseStatusMap[a.responseStatus]) !== null && _a !== void 0
                    ? _a
                    : 'none',
                isRequired: !a.optional,
                isOrganizer: (_b = a.organizer) !== null && _b !== void 0 ? _b : false,
              }
            );
          }),
          responseStatus: 'none',
          isRecurring:
            !!((_k = event.recurrence) === null || _k === void 0 ? void 0 : _k.length) ||
            !!event.recurringEventId,
          calendarId: calendarId,
          calendarName: calendarId === 'primary' ? 'Primary Calendar' : calendarId,
          visibility:
            event.visibility === 'private'
              ? 'private'
              : event.visibility === 'confidential'
                ? 'confidential'
                : 'public',
        }
      ),
      ((_o =
        (_m = (_l = event.reminders) === null || _l === void 0 ? void 0 : _l.overrides) === null ||
        _m === void 0
          ? void 0
          : _m[0]) === null || _o === void 0
        ? void 0
        : _o.minutes) !== undefined && {
        reminderMinutes: event.reminders.overrides[0].minutes,
      }
    );
  };
  GmailAdapter.prototype.normalizePerson = function (person) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    var name = (_a = person.names) === null || _a === void 0 ? void 0 : _a[0];
    var emails = (_b = person.emailAddresses) !== null && _b !== void 0 ? _b : [];
    var phones = (_c = person.phoneNumbers) !== null && _c !== void 0 ? _c : [];
    var org = (_d = person.organizations) === null || _d === void 0 ? void 0 : _d[0];
    var photo = (_e = person.photos) === null || _e === void 0 ? void 0 : _e[0];
    var metadata =
      (_g = (_f = person.metadata) === null || _f === void 0 ? void 0 : _f.sources) === null ||
      _g === void 0
        ? void 0
        : _g[0];
    var phoneNumbers = phones.map(function (p) {
      var _a, _b;
      return {
        number: p.value,
        type:
          (_b = (_a = p.type) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null &&
          _b !== void 0
            ? _b
            : 'other',
      };
    });
    return __assign(
      __assign(
        __assign(
          __assign(
            __assign(
              __assign(
                __assign(
                  __assign(
                    {
                      id: (0, email_provider_1.createStandardId)(
                        'GMAIL',
                        person.resourceName.replace('people/', '')
                      ),
                      source: 'GMAIL',
                      providerContactId: person.resourceName,
                      displayName:
                        (_k =
                          (_h = name === null || name === void 0 ? void 0 : name.displayName) !==
                            null && _h !== void 0
                            ? _h
                            : (_j = emails[0]) === null || _j === void 0
                              ? void 0
                              : _j.value) !== null && _k !== void 0
                          ? _k
                          : '',
                    },
                    (name === null || name === void 0 ? void 0 : name.givenName) && {
                      firstName: name.givenName,
                    }
                  ),
                  (name === null || name === void 0 ? void 0 : name.familyName) && {
                    lastName: name.familyName,
                  }
                ),
                {
                  emailAddresses: emails.map(function (e) {
                    return __assign({ email: e.value }, e.displayName && { name: e.displayName });
                  }),
                  phoneNumbers: phoneNumbers,
                }
              ),
              (org === null || org === void 0 ? void 0 : org.name) && { company: org.name }
            ),
            (org === null || org === void 0 ? void 0 : org.title) && { jobTitle: org.title }
          ),
          (org === null || org === void 0 ? void 0 : org.department) && {
            department: org.department,
          }
        ),
        (photo === null || photo === void 0 ? void 0 : photo.url) && { photoUrl: photo.url }
      ),
      (metadata === null || metadata === void 0 ? void 0 : metadata.updateTime) && {
        modifiedAt: metadata.updateTime,
      }
    );
  };
  GmailAdapter.prototype.updateSyncStatus = function (state, itemsSynced, error) {
    var lastSyncAt = state === 'synced' ? new Date().toISOString() : this.syncStatus.lastSyncAt;
    this.syncStatus = __assign(
      __assign(
        __assign({ state: state }, lastSyncAt && { lastSyncAt: lastSyncAt }),
        itemsSynced !== undefined && { itemsSynced: itemsSynced }
      ),
      error && { error: error }
    );
  };
  GmailAdapter.prototype.isNotFoundError = function (error) {
    return error instanceof email_provider_1.EmailProviderError && error.code === 'NOT_FOUND';
  };
  GmailAdapter.prototype.wrapError = function (error, message) {
    if (error instanceof email_provider_1.EmailProviderError) {
      return error;
    }
    return new email_provider_1.EmailProviderError(
      ''.concat(message, ': ').concat(this.getErrorMessage(error)),
      'GMAIL',
      'UNKNOWN',
      error
    );
  };
  GmailAdapter.prototype.getErrorMessage = function (error) {
    if (error instanceof Error) return error.message;
    return String(error);
  };
  return GmailAdapter;
})();
exports.GmailAdapter = GmailAdapter;
