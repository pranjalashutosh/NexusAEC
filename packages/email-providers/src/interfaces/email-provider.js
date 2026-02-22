'use strict';
/**
 * @nexus-aec/email-providers - EmailProvider Interface
 *
 * Common interface that both OutlookAdapter and GmailAdapter must implement.
 * This allows the UnifiedInboxService to treat all providers identically.
 */
var __extends =
  (this && this.__extends) ||
  (function () {
    var extendStatics = function (d, b) {
      extendStatics =
        Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array &&
          function (d, b) {
            d.__proto__ = b;
          }) ||
        function (d, b) {
          for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p];
        };
      return extendStatics(d, b);
    };
    return function (d, b) {
      if (typeof b !== 'function' && b !== null)
        throw new TypeError('Class extends value ' + String(b) + ' is not a constructor or null');
      extendStatics(d, b);
      function __() {
        this.constructor = d;
      }
      d.prototype = b === null ? Object.create(b) : ((__.prototype = b.prototype), new __());
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.EmailProviderError = void 0;
exports.isEmailProviderError = isEmailProviderError;
exports.createStandardId = createStandardId;
exports.parseStandardId = parseStandardId;
// =============================================================================
// Helper Types
// =============================================================================
/**
 * Error thrown by provider operations
 */
var EmailProviderError = /** @class */ (function (_super) {
  __extends(EmailProviderError, _super);
  function EmailProviderError(message, source, code, cause) {
    var _this = _super.call(this, message) || this;
    _this.source = source;
    _this.code = code;
    _this.cause = cause;
    _this.name = 'EmailProviderError';
    return _this;
  }
  return EmailProviderError;
})(Error);
exports.EmailProviderError = EmailProviderError;
/**
 * Type guard to check if error is EmailProviderError
 */
function isEmailProviderError(error) {
  return error instanceof EmailProviderError;
}
/**
 * Create a standardized email ID from provider ID
 */
function createStandardId(source, providerId) {
  return ''.concat(source.toLowerCase(), ':').concat(providerId);
}
/**
 * Parse a standardized ID to get source and provider ID
 */
function parseStandardId(standardId) {
  var _a;
  var parts = standardId.split(':');
  if (parts.length < 2) return null;
  var sourceStr = (_a = parts[0]) === null || _a === void 0 ? void 0 : _a.toUpperCase();
  if (sourceStr !== 'OUTLOOK' && sourceStr !== 'GMAIL') return null;
  return {
    source: sourceStr,
    providerId: parts.slice(1).join(':'), // Handle IDs that contain colons
  };
}
