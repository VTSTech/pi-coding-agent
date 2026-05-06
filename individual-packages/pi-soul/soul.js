var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// ../../node_modules/typebox/build/system/memory/memory.mjs
var memory_exports = {};
__export(memory_exports, {
  Assign: () => Assign,
  Clone: () => Clone,
  Create: () => Create,
  Discard: () => Discard,
  Metrics: () => Metrics,
  Update: () => Update
});

// ../../node_modules/typebox/build/system/memory/metrics.mjs
var Metrics = {
  assign: 0,
  create: 0,
  clone: 0,
  discard: 0,
  update: 0
};

// ../../node_modules/typebox/build/system/memory/assign.mjs
function Assign(left, right) {
  Metrics.assign += 1;
  return { ...left, ...right };
}

// ../../node_modules/typebox/build/guard/guard.mjs
var guard_exports = {};
__export(guard_exports, {
  Entries: () => Entries,
  EntriesRegExp: () => EntriesRegExp,
  Every: () => Every,
  EveryAll: () => EveryAll,
  GraphemeCount: () => GraphemeCount2,
  HasPropertyKey: () => HasPropertyKey,
  IsArray: () => IsArray,
  IsAsyncIterator: () => IsAsyncIterator,
  IsBigInt: () => IsBigInt,
  IsBoolean: () => IsBoolean,
  IsClassInstance: () => IsClassInstance,
  IsConstructor: () => IsConstructor,
  IsDeepEqual: () => IsDeepEqual,
  IsEqual: () => IsEqual,
  IsFunction: () => IsFunction,
  IsGreaterEqualThan: () => IsGreaterEqualThan,
  IsGreaterThan: () => IsGreaterThan,
  IsInteger: () => IsInteger,
  IsIterator: () => IsIterator,
  IsLessEqualThan: () => IsLessEqualThan,
  IsLessThan: () => IsLessThan,
  IsMaxLength: () => IsMaxLength2,
  IsMinLength: () => IsMinLength2,
  IsMultipleOf: () => IsMultipleOf,
  IsNull: () => IsNull,
  IsNumber: () => IsNumber,
  IsObject: () => IsObject,
  IsObjectNotArray: () => IsObjectNotArray,
  IsString: () => IsString,
  IsSymbol: () => IsSymbol,
  IsUndefined: () => IsUndefined,
  IsValueLike: () => IsValueLike,
  Keys: () => Keys,
  Symbols: () => Symbols,
  TakeLeft: () => TakeLeft,
  Values: () => Values
});

// ../../node_modules/typebox/build/guard/string.mjs
function IsBetween(value, min, max) {
  return value >= min && value <= max;
}
function IsRegionalIndicator(value) {
  return IsBetween(value, 127462, 127487);
}
function IsVariationSelector(value) {
  return IsBetween(value, 65024, 65039);
}
function IsCombiningMark(value) {
  return IsBetween(value, 768, 879) || IsBetween(value, 6832, 6911) || IsBetween(value, 7616, 7679) || IsBetween(value, 65056, 65071);
}
function CodePointLength(value) {
  return value > 65535 ? 2 : 1;
}
function ConsumeModifiers(value, index) {
  while (index < value.length) {
    const point = value.codePointAt(index);
    if (IsCombiningMark(point) || IsVariationSelector(point)) {
      index += CodePointLength(point);
    } else {
      break;
    }
  }
  return index;
}
function NextGraphemeClusterIndex(value, clusterStart) {
  const startCP = value.codePointAt(clusterStart);
  let clusterEnd = clusterStart + CodePointLength(startCP);
  clusterEnd = ConsumeModifiers(value, clusterEnd);
  while (clusterEnd < value.length - 1 && value[clusterEnd] === "\u200D") {
    const nextCP = value.codePointAt(clusterEnd + 1);
    clusterEnd += 1 + CodePointLength(nextCP);
    clusterEnd = ConsumeModifiers(value, clusterEnd);
  }
  if (IsRegionalIndicator(startCP) && clusterEnd < value.length && IsRegionalIndicator(value.codePointAt(clusterEnd))) {
    clusterEnd += CodePointLength(value.codePointAt(clusterEnd));
  }
  return clusterEnd;
}
function IsGraphemeCodePoint(value) {
  return IsBetween(value, 55296, 56319) || // High surrogate
  IsBetween(value, 768, 879) || // Combining diacritical marks
  value === 8205;
}
function GraphemeCount(value) {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = NextGraphemeClusterIndex(value, index);
    count++;
  }
  return count;
}
function IsMinLength(value, minLength) {
  if (minLength === 0)
    return true;
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = NextGraphemeClusterIndex(value, index);
    count++;
    if (count >= minLength)
      return true;
  }
  return false;
}
function IsMaxLength(value, maxLength) {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = NextGraphemeClusterIndex(value, index);
    count++;
    if (count > maxLength)
      return false;
  }
  return true;
}
function IsMinLengthFast(value, minLength) {
  if (minLength === 0)
    return true;
  let index = 0;
  while (index < value.length) {
    if (IsGraphemeCodePoint(value.charCodeAt(index))) {
      return IsMinLength(value, minLength);
    }
    index++;
    if (index >= minLength)
      return true;
  }
  return false;
}
function IsMaxLengthFast(value, maxLength) {
  let index = 0;
  while (index < value.length) {
    if (IsGraphemeCodePoint(value.charCodeAt(index))) {
      return IsMaxLength(value, maxLength);
    }
    index++;
    if (index > maxLength)
      return false;
  }
  return true;
}

// ../../node_modules/typebox/build/guard/guard.mjs
function IsArray(value) {
  return Array.isArray(value);
}
function IsAsyncIterator(value) {
  return IsObject(value) && Symbol.asyncIterator in value;
}
function IsBigInt(value) {
  return IsEqual(typeof value, "bigint");
}
function IsBoolean(value) {
  return IsEqual(typeof value, "boolean");
}
function IsConstructor(value) {
  if (IsUndefined(value) || !IsFunction(value))
    return false;
  const result = Function.prototype.toString.call(value);
  if (/^class\s/.test(result))
    return true;
  if (/\[native code\]/.test(result))
    return true;
  return false;
}
function IsFunction(value) {
  return IsEqual(typeof value, "function");
}
function IsInteger(value) {
  return Number.isInteger(value);
}
function IsIterator(value) {
  return IsObject(value) && Symbol.iterator in value;
}
function IsNull(value) {
  return IsEqual(value, null);
}
function IsNumber(value) {
  return Number.isFinite(value);
}
function IsObjectNotArray(value) {
  return IsObject(value) && !IsArray(value);
}
function IsObject(value) {
  return IsEqual(typeof value, "object") && !IsNull(value);
}
function IsString(value) {
  return IsEqual(typeof value, "string");
}
function IsSymbol(value) {
  return IsEqual(typeof value, "symbol");
}
function IsUndefined(value) {
  return IsEqual(value, void 0);
}
function IsEqual(left, right) {
  return left === right;
}
function IsGreaterThan(left, right) {
  return left > right;
}
function IsLessThan(left, right) {
  return left < right;
}
function IsLessEqualThan(left, right) {
  return left <= right;
}
function IsGreaterEqualThan(left, right) {
  return left >= right;
}
function IsMultipleOf(dividend, divisor) {
  if (IsBigInt(dividend) || IsBigInt(divisor)) {
    return BigInt(dividend) % BigInt(divisor) === 0n;
  }
  const tolerance = 1e-10;
  if (!IsNumber(dividend))
    return true;
  if (IsInteger(dividend) && 1 / divisor % 1 === 0)
    return true;
  const mod = dividend % divisor;
  return Math.min(Math.abs(mod), Math.abs(mod - divisor)) < tolerance;
}
function IsClassInstance(value) {
  if (!IsObject(value))
    return false;
  const proto = globalThis.Object.getPrototypeOf(value);
  if (IsNull(proto))
    return false;
  return IsEqual(typeof proto.constructor, "function") && !(IsEqual(proto.constructor, globalThis.Object) || IsEqual(proto.constructor.name, "Object"));
}
function IsValueLike(value) {
  return IsBigInt(value) || IsBoolean(value) || IsNull(value) || IsNumber(value) || IsString(value) || IsUndefined(value);
}
function GraphemeCount2(value) {
  return GraphemeCount(value);
}
function IsMaxLength2(value, length) {
  return IsMaxLengthFast(value, length);
}
function IsMinLength2(value, length) {
  return IsMinLengthFast(value, length);
}
function Every(value, offset, callback) {
  for (let index = offset; index < value.length; index++) {
    if (!callback(value[index], index))
      return false;
  }
  return true;
}
function EveryAll(value, offset, callback) {
  let result = true;
  for (let index = offset; index < value.length; index++) {
    if (!callback(value[index], index))
      result = false;
  }
  return result;
}
function TakeLeft(array, true_, false_) {
  return IsEqual(array.length, 0) ? false_() : true_(array[0], array.slice(1));
}
function HasPropertyKey(value, key) {
  const isProtoField = IsEqual(key, "__proto__") || IsEqual(key, "constructor");
  return isProtoField ? Object.prototype.hasOwnProperty.call(value, key) : key in value;
}
function EntriesRegExp(value) {
  return Keys(value).map((key) => [new RegExp(`^${key}$`), value[key]]);
}
function Entries(value) {
  return Object.entries(value);
}
function Keys(value) {
  return Object.getOwnPropertyNames(value);
}
function Symbols(value) {
  return Object.getOwnPropertySymbols(value);
}
function Values(value) {
  return Object.values(value);
}
function DeepEqualObject(left, right) {
  if (!IsObject(right))
    return false;
  const keys = Keys(left);
  return IsEqual(keys.length, Keys(right).length) && keys.every((key) => IsDeepEqual(left[key], right[key]));
}
function DeepEqualArray(left, right) {
  return IsArray(right) && IsEqual(left.length, right.length) && left.every((_, index) => IsDeepEqual(left[index], right[index]));
}
function IsDeepEqual(left, right) {
  return IsArray(left) ? DeepEqualArray(left, right) : IsObject(left) ? DeepEqualObject(left, right) : IsEqual(left, right);
}

// ../../node_modules/typebox/build/system/memory/clone.mjs
function IsGuard(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~guard");
}
function FromGuard(value) {
  return value;
}
function FromArray(value) {
  return value.map((value2) => FromValue(value2));
}
function FromObject(value) {
  const result = {};
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (guard_exports.HasPropertyKey(descriptor, "value")) {
      Object.defineProperty(result, key, { ...descriptor, value: FromValue(descriptor.value) });
    }
  }
  return result;
}
function FromRegExp(value) {
  return new RegExp(value.source, value.flags);
}
function FromUnknown(value) {
  return value;
}
function FromValue(value) {
  return value instanceof RegExp ? FromRegExp(value) : IsGuard(value) ? FromGuard(value) : guard_exports.IsArray(value) ? FromArray(value) : guard_exports.IsObject(value) ? FromObject(value) : FromUnknown(value);
}
function Clone(value) {
  Metrics.clone += 1;
  return FromValue(value);
}

// ../../node_modules/typebox/build/system/settings/settings.mjs
var settings_exports = {};
__export(settings_exports, {
  Get: () => Get,
  Reset: () => Reset,
  Set: () => Set2
});
var settings = {
  immutableTypes: false,
  maxErrors: 8,
  useAcceleration: true,
  exactOptionalPropertyTypes: false,
  enumerableKind: false,
  correctiveParse: false
};
function Reset() {
  settings.immutableTypes = false;
  settings.maxErrors = 8;
  settings.useAcceleration = true;
  settings.exactOptionalPropertyTypes = false;
  settings.enumerableKind = false;
  settings.correctiveParse = false;
}
function Set2(options) {
  for (const key of guard_exports.Keys(options)) {
    const value = options[key];
    if (value !== void 0) {
      Object.defineProperty(settings, key, { value });
    }
  }
}
function Get() {
  return settings;
}

// ../../node_modules/typebox/build/system/memory/create.mjs
function MergeHidden(left, right) {
  for (const key of Object.keys(right)) {
    Object.defineProperty(left, key, {
      configurable: true,
      writable: true,
      enumerable: false,
      value: right[key]
    });
  }
  return left;
}
function Merge(left, right) {
  return { ...left, ...right };
}
function Create(hidden, enumerable, options = {}) {
  Metrics.create += 1;
  const settings2 = settings_exports.Get();
  const withOptions = Merge(enumerable, options);
  const withHidden = settings2.enumerableKind ? Merge(withOptions, hidden) : MergeHidden(withOptions, hidden);
  return settings2.immutableTypes ? Object.freeze(withHidden) : withHidden;
}

// ../../node_modules/typebox/build/system/memory/discard.mjs
function Discard(value, propertyKeys) {
  Metrics.discard += 1;
  const result = {};
  const descriptors = Object.getOwnPropertyDescriptors(Clone(value));
  const keysToDiscard = new Set(propertyKeys);
  for (const key of Object.keys(descriptors)) {
    if (keysToDiscard.has(key))
      continue;
    Object.defineProperty(result, key, descriptors[key]);
  }
  return result;
}

// ../../node_modules/typebox/build/system/memory/update.mjs
function Update(current, hidden, enumerable) {
  Metrics.update += 1;
  const settings2 = settings_exports.Get();
  const result = Clone(current);
  for (const key of Object.keys(hidden)) {
    Object.defineProperty(result, key, {
      configurable: true,
      writable: true,
      enumerable: settings2.enumerableKind,
      value: hidden[key]
    });
  }
  for (const key of Object.keys(enumerable)) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: enumerable[key]
    });
  }
  return result;
}

// ../../node_modules/typebox/build/type/types/schema.mjs
function IsKind(value, kind) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.IsEqual(value["~kind"], kind);
}
function IsSchema(value) {
  return guard_exports.IsObject(value);
}

// ../../node_modules/typebox/build/type/action/_optional.mjs
function OptionalAddAction(type) {
  return memory_exports.Create({ ["~kind"]: "OptionalAddAction" }, { type }, {});
}
function IsOptionalAddAction(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "OptionalAddAction") && IsSchema(value.type);
}
function OptionalRemoveAction(type) {
  return memory_exports.Create({ ["~kind"]: "OptionalRemoveAction" }, { type }, {});
}
function IsOptionalRemoveAction(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "OptionalRemoveAction") && IsSchema(value.type);
}

// ../../node_modules/typebox/build/type/action/_readonly.mjs
function ReadonlyAddAction(type) {
  return memory_exports.Create({ ["~kind"]: "ReadonlyAddAction" }, { type }, {});
}
function IsReadonlyAddAction(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "ReadonlyAddAction") && IsSchema(value.type);
}
function ReadonlyRemoveAction(type) {
  return memory_exports.Create({ ["~kind"]: "ReadonlyRemoveAction" }, { type }, {});
}
function IsReadonlyRemoveAction(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "ReadonlyRemoveAction") && IsSchema(value.type);
}

// ../../node_modules/typebox/build/type/types/deferred.mjs
function Deferred(action, parameters, options) {
  return memory_exports.Create({ "~kind": "Deferred" }, { action, parameters, options }, {});
}
function IsDeferred(value) {
  return IsKind(value, "Deferred");
}

// ../../node_modules/typebox/build/type/types/promise.mjs
function _Promise_(item, options) {
  return memory_exports.Create({ ["~kind"]: "Promise" }, { type: "promise", item }, options);
}
function IsPromise(value) {
  return IsKind(value, "Promise");
}
function PromiseOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "item"]);
}

// ../../node_modules/typebox/build/type/types/_immutable.mjs
function ImmutableAdd(type) {
  return memory_exports.Update(type, { "~immutable": true }, {});
}
function Immutable(type) {
  return ImmutableAdd(type);
}
function IsImmutable(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~immutable");
}

// ../../node_modules/typebox/build/type/types/_optional.mjs
function OptionalRemove(type) {
  const result = memory_exports.Discard(type, ["~optional"]);
  return result;
}
function OptionalAdd(type) {
  return memory_exports.Update(type, { "~optional": true }, {});
}
function Optional(type) {
  return OptionalAdd(type);
}
function IsOptional(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~optional");
}

// ../../node_modules/typebox/build/type/types/_readonly.mjs
function ReadonlyRemove(type) {
  return memory_exports.Discard(type, ["~readonly"]);
}
function ReadonlyAdd(type) {
  return memory_exports.Update(type, { "~readonly": true }, {});
}
function Readonly(type) {
  return ReadonlyAdd(type);
}
function IsReadonly(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~readonly");
}

// ../../node_modules/typebox/build/type/types/base.mjs
function BaseProperty(value) {
  return {
    enumerable: settings_exports.Get().enumerableKind,
    writable: false,
    configurable: false,
    value
  };
}
var Base = class {
  constructor() {
    globalThis.Object.defineProperty(this, "~kind", BaseProperty("Base"));
    globalThis.Object.defineProperty(this, "~guard", BaseProperty({
      check: (value) => this.Check(value),
      errors: (value) => this.Errors(value)
    }));
  }
  /** Checks a value or returns false if invalid */
  Check(_value) {
    return true;
  }
  /** Returns errors for a value. Return an empty array if valid.  */
  Errors(_value) {
    return [];
  }
  /** Converts a value into this type */
  Convert(value) {
    return value;
  }
  /** Cleans a value according to this type */
  Clean(value) {
    return value;
  }
  /** Returns a default value for this type */
  Default(value) {
    return value;
  }
  /** Creates a new instance of this type */
  Create() {
    throw new Error("Create not implemented");
  }
  /** Clones this type  */
  Clone() {
    throw Error("Clone not implemented");
  }
};
function IsBase(value) {
  return IsKind(value, "Base");
}

// ../../node_modules/typebox/build/type/types/array.mjs
function _Array_(items, options) {
  return memory_exports.Create({ "~kind": "Array" }, { type: "array", items }, options);
}
function IsArray2(value) {
  return IsKind(value, "Array");
}
function ArrayOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "items"]);
}

// ../../node_modules/typebox/build/type/types/async_iterator.mjs
function AsyncIterator(iteratorItems, options) {
  return memory_exports.Create({ "~kind": "AsyncIterator" }, { type: "asyncIterator", iteratorItems }, options);
}
function IsAsyncIterator2(value) {
  return IsKind(value, "AsyncIterator");
}
function AsyncIteratorOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "iteratorItems"]);
}

// ../../node_modules/typebox/build/type/types/constructor.mjs
function Constructor(parameters, instanceType, options = {}) {
  return memory_exports.Create({ "~kind": "Constructor" }, { type: "constructor", parameters, instanceType }, options);
}
function IsConstructor2(value) {
  return IsKind(value, "Constructor");
}
function ConstructorOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "parameters", "instanceType"]);
}

// ../../node_modules/typebox/build/type/types/function.mjs
function _Function_(parameters, returnType, options = {}) {
  return memory_exports.Create({ ["~kind"]: "Function" }, { type: "function", parameters, returnType }, options);
}
function IsFunction2(value) {
  return IsKind(value, "Function");
}
function FunctionOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "parameters", "returnType"]);
}

// ../../node_modules/typebox/build/type/types/ref.mjs
function Ref(ref, options) {
  return memory_exports.Create({ ["~kind"]: "Ref" }, { $ref: ref }, options);
}
function IsRef(value) {
  return IsKind(value, "Ref");
}

// ../../node_modules/typebox/build/type/types/generic.mjs
function Generic(parameters, expression) {
  return memory_exports.Create({ "~kind": "Generic" }, { type: "generic", parameters, expression });
}
function IsGeneric(value) {
  return IsKind(value, "Generic");
}

// ../../node_modules/typebox/build/type/types/any.mjs
function Any(options) {
  return memory_exports.Create({ ["~kind"]: "Any" }, {}, options);
}
function IsAny(value) {
  return IsKind(value, "Any");
}

// ../../node_modules/typebox/build/type/types/never.mjs
var NeverPattern = "(?!)";
function Never(options) {
  return memory_exports.Create({ "~kind": "Never" }, { not: {} }, options);
}
function IsNever(value) {
  return IsKind(value, "Never");
}

// ../../node_modules/typebox/build/type/types/properties.mjs
function RequiredArray(properties) {
  return guard_exports.Keys(properties).filter((key) => !IsOptional(properties[key]));
}
function PropertyKeys(properties) {
  return guard_exports.Keys(properties);
}
function PropertyValues(properties) {
  return guard_exports.Values(properties);
}

// ../../node_modules/typebox/build/type/types/object.mjs
function _Object_(properties, options = {}) {
  const requiredKeys = RequiredArray(properties);
  const required = requiredKeys.length > 0 ? { required: requiredKeys } : {};
  return memory_exports.Create({ "~kind": "Object" }, { type: "object", ...required, properties }, options);
}
function IsObject2(value) {
  return IsKind(value, "Object");
}
function ObjectOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "properties", "required"]);
}

// ../../node_modules/typebox/build/type/types/union.mjs
function Union(anyOf, options = {}) {
  return memory_exports.Create({ "~kind": "Union" }, { anyOf }, options);
}
function IsUnion(value) {
  return IsKind(value, "Union");
}
function UnionOptions(type) {
  return memory_exports.Discard(type, ["~kind", "anyOf"]);
}

// ../../node_modules/typebox/build/type/types/unknown.mjs
function Unknown(options) {
  return memory_exports.Create({ ["~kind"]: "Unknown" }, {}, options);
}
function IsUnknown(value) {
  return IsKind(value, "Unknown");
}

// ../../node_modules/typebox/build/type/types/cyclic.mjs
function Cyclic($defs, $ref, options) {
  const defs = guard_exports.Keys($defs).reduce((result, key) => {
    return { ...result, [key]: memory_exports.Update($defs[key], {}, { $id: key }) };
  }, {});
  return memory_exports.Create({ ["~kind"]: "Cyclic" }, { $defs: defs, $ref }, options);
}
function IsCyclic(value) {
  return IsKind(value, "Cyclic");
}

// ../../node_modules/typebox/build/type/types/unsafe.mjs
function Unsafe(schema) {
  return memory_exports.Update(schema, { ["~unsafe"]: null }, {});
}
function IsUnsafe(value) {
  return guard_exports.IsObjectNotArray(value) && guard_exports.HasPropertyKey(value, "~unsafe") && guard_exports.IsNull(value["~unsafe"]);
}

// ../../node_modules/typebox/build/system/arguments/arguments.mjs
var arguments_exports = {};
__export(arguments_exports, {
  Match: () => Match
});
function Match(args, match) {
  return match[args.length]?.(...args) ?? (() => {
    throw Error("Invalid Arguments");
  })();
}

// ../../node_modules/typebox/build/type/types/infer.mjs
function Infer(...args) {
  const [name, extends_] = arguments_exports.Match(args, {
    2: (name2, extends_2) => [name2, extends_2, extends_2],
    1: (name2) => [name2, Unknown(), Unknown()]
  });
  return memory_exports.Create({ ["~kind"]: "Infer" }, { type: "infer", name, extends: extends_ }, {});
}
function IsInfer(value) {
  return IsKind(value, "Infer");
}

// ../../node_modules/typebox/build/type/engine/enum/typescript_enum_to_enum_values.mjs
function IsTypeScriptEnumLike(value) {
  return guard_exports.IsObjectNotArray(value);
}
function TypeScriptEnumToEnumValues(type) {
  const keys = guard_exports.Keys(type).filter((key) => isNaN(key));
  return keys.reduce((result, key) => [...result, type[key]], []);
}

// ../../node_modules/typebox/build/type/types/enum.mjs
function Enum(value, options) {
  const values = IsTypeScriptEnumLike(value) ? TypeScriptEnumToEnumValues(value) : value;
  return memory_exports.Create({ "~kind": "Enum" }, { enum: values }, options);
}
function IsEnum(value) {
  return IsKind(value, "Enum");
}

// ../../node_modules/typebox/build/type/types/intersect.mjs
function Intersect(types, options = {}) {
  return memory_exports.Create({ "~kind": "Intersect" }, { allOf: types }, options);
}
function IsIntersect(value) {
  return IsKind(value, "Intersect");
}
function IntersectOptions(type) {
  return memory_exports.Discard(type, ["~kind", "allOf"]);
}

// ../../node_modules/typebox/build/system/unreachable/unreachable.mjs
function Unreachable() {
  throw new Error("Unreachable");
}

// ../../node_modules/typebox/build/system/hashing/hash.mjs
var ByteMarker;
(function(ByteMarker2) {
  ByteMarker2[ByteMarker2["Array"] = 0] = "Array";
  ByteMarker2[ByteMarker2["BigInt"] = 1] = "BigInt";
  ByteMarker2[ByteMarker2["Boolean"] = 2] = "Boolean";
  ByteMarker2[ByteMarker2["Date"] = 3] = "Date";
  ByteMarker2[ByteMarker2["Constructor"] = 4] = "Constructor";
  ByteMarker2[ByteMarker2["Function"] = 5] = "Function";
  ByteMarker2[ByteMarker2["Null"] = 6] = "Null";
  ByteMarker2[ByteMarker2["Number"] = 7] = "Number";
  ByteMarker2[ByteMarker2["Object"] = 8] = "Object";
  ByteMarker2[ByteMarker2["RegExp"] = 9] = "RegExp";
  ByteMarker2[ByteMarker2["String"] = 10] = "String";
  ByteMarker2[ByteMarker2["Symbol"] = 11] = "Symbol";
  ByteMarker2[ByteMarker2["TypeArray"] = 12] = "TypeArray";
  ByteMarker2[ByteMarker2["Undefined"] = 13] = "Undefined";
})(ByteMarker || (ByteMarker = {}));
var Accumulator = BigInt("14695981039346656037");
var [Prime, Size] = [BigInt("1099511628211"), BigInt(
  "18446744073709551616"
  /* 2 ^ 64 */
)];
var Bytes = Array.from({ length: 256 }).map((_, i) => BigInt(i));
var F64 = new Float64Array(1);
var F64In = new DataView(F64.buffer);
var F64Out = new Uint8Array(F64.buffer);
var encoder = new TextEncoder();

// ../../node_modules/typebox/build/type/types/_codec.mjs
var EncodeBuilder = class {
  constructor(type, decode) {
    this.type = type;
    this.decode = decode;
  }
  Encode(callback) {
    const type = this.type;
    const decode = IsCodec(type) ? (value) => this.decode(type["~codec"].decode(value)) : this.decode;
    const encode = IsCodec(type) ? (value) => type["~codec"].encode(callback(value)) : callback;
    const codec = { decode, encode };
    return memory_exports.Update(this.type, { "~codec": codec }, {});
  }
};
var DecodeBuilder = class {
  constructor(type) {
    this.type = type;
  }
  Decode(callback) {
    return new EncodeBuilder(this.type, callback);
  }
};
function Codec(type) {
  return new DecodeBuilder(type);
}
function Decode(type, callback) {
  return Codec(type).Decode(callback).Encode(() => {
    throw Error("Encode not implemented");
  });
}
function Encode(type, callback) {
  return Codec(type).Decode(() => {
    throw Error("Decode not implemented");
  }).Encode(callback);
}
function IsCodec(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~codec") && guard_exports.IsObject(value["~codec"]) && guard_exports.HasPropertyKey(value["~codec"], "encode") && guard_exports.HasPropertyKey(value["~codec"], "decode");
}

// ../../node_modules/typebox/build/type/types/_refine.mjs
function RefineAdd(type, refinement) {
  const refinements = IsRefine(type) ? [...type["~refine"], refinement] : [refinement];
  return memory_exports.Update(type, { "~refine": refinements }, {});
}
function Refine(...args) {
  const [type, check, error_or_message] = arguments_exports.Match(args, {
    3: (type2, check2, error2) => [type2, check2, error2],
    2: (type2, check2) => [type2, check2, () => "Refine Error"]
  });
  const error = guard_exports.IsString(error_or_message) ? () => error_or_message : error_or_message;
  return RefineAdd(type, { check, error });
}
function IsRefinement(value) {
  return guard_exports.IsObjectNotArray(value) && guard_exports.HasPropertyKey(value, "check") && guard_exports.HasPropertyKey(value, "error") && guard_exports.IsFunction(value.check) && guard_exports.IsFunction(value.error);
}
function IsRefine(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~refine") && guard_exports.IsArray(value["~refine"]) && guard_exports.Every(value["~refine"], 0, (value2) => IsRefinement(value2));
}

// ../../node_modules/typebox/build/type/types/bigint.mjs
var BigIntPattern = "-?(?:0|[1-9][0-9]*)n";
function BigInt2(options) {
  return memory_exports.Create({ "~kind": "BigInt" }, { type: "bigint" }, options);
}
function IsBigInt2(value) {
  return IsKind(value, "BigInt");
}

// ../../node_modules/typebox/build/type/types/boolean.mjs
function Boolean2(options) {
  return memory_exports.Create({ "~kind": "Boolean" }, { type: "boolean" }, options);
}
function IsBoolean2(value) {
  return IsKind(value, "Boolean");
}

// ../../node_modules/typebox/build/type/types/identifier.mjs
function Identifier(name) {
  return memory_exports.Create({ "~kind": "Identifier" }, { name });
}
function IsIdentifier(value) {
  return IsKind(value, "Identifier");
}

// ../../node_modules/typebox/build/type/types/integer.mjs
var IntegerPattern = "-?(?:0|[1-9][0-9]*)";
function Integer(options) {
  return memory_exports.Create({ "~kind": "Integer" }, { type: "integer" }, options);
}
function IsInteger2(value) {
  return IsKind(value, "Integer");
}

// ../../node_modules/typebox/build/type/types/iterator.mjs
function Iterator(iteratorItems, options) {
  return memory_exports.Create({ "~kind": "Iterator" }, { type: "iterator", iteratorItems }, options);
}
function IsIterator2(value) {
  return IsKind(value, "Iterator");
}
function IteratorOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "iteratorItems"]);
}

// ../../node_modules/typebox/build/type/types/literal.mjs
var InvalidLiteralValue = class extends Error {
  constructor(value) {
    super(`Invalid Literal value`);
    Object.defineProperty(this, "cause", {
      value: { value },
      writable: false,
      configurable: false,
      enumerable: false
    });
  }
};
function LiteralTypeName(value) {
  return guard_exports.IsBigInt(value) ? "bigint" : guard_exports.IsBoolean(value) ? "boolean" : guard_exports.IsNumber(value) ? "number" : guard_exports.IsString(value) ? "string" : (() => {
    throw new InvalidLiteralValue(value);
  })();
}
function Literal(value, options) {
  return memory_exports.Create({ "~kind": "Literal" }, { type: LiteralTypeName(value), const: value }, options);
}
function IsLiteralValue(value) {
  return guard_exports.IsBigInt(value) || guard_exports.IsBoolean(value) || guard_exports.IsNumber(value) || guard_exports.IsString(value);
}
function IsLiteralNumber(value) {
  return IsLiteral(value) && guard_exports.IsNumber(value.const);
}
function IsLiteralString(value) {
  return IsLiteral(value) && guard_exports.IsString(value.const);
}
function IsLiteral(value) {
  return IsKind(value, "Literal");
}

// ../../node_modules/typebox/build/type/types/null.mjs
function Null(options) {
  return memory_exports.Create({ "~kind": "Null" }, { type: "null" }, options);
}
function IsNull2(value) {
  return IsKind(value, "Null");
}

// ../../node_modules/typebox/build/type/types/number.mjs
var NumberPattern = "-?(?:0|[1-9][0-9]*)(?:.[0-9]+)?";
function Number2(options) {
  return memory_exports.Create({ "~kind": "Number" }, { type: "number" }, options);
}
function IsNumber2(value) {
  return IsKind(value, "Number");
}

// ../../node_modules/typebox/build/type/types/symbol.mjs
function Symbol2(options) {
  return memory_exports.Create({ "~kind": "Symbol" }, { type: "symbol" }, options);
}
function IsSymbol2(value) {
  return IsKind(value, "Symbol");
}

// ../../node_modules/typebox/build/type/types/parameter.mjs
function Parameter(...args) {
  const [name, extends_, equals] = arguments_exports.Match(args, {
    3: (name2, extends_2, equals2) => [name2, extends_2, equals2],
    2: (name2, extends_2) => [name2, extends_2, extends_2],
    1: (name2) => [name2, Unknown(), Unknown()]
  });
  return memory_exports.Create({ "~kind": "Parameter" }, { name, extends: extends_, equals }, {});
}
function IsParameter(value) {
  return IsKind(value, "Parameter");
}

// ../../node_modules/typebox/build/type/types/string.mjs
var StringPattern = ".*";
function String2(options) {
  return memory_exports.Create({ "~kind": "String" }, { type: "string" }, options);
}
function IsString2(value) {
  return IsKind(value, "String");
}

// ../../node_modules/typebox/build/type/engine/patterns/pattern.mjs
function ParsePatternIntoTypes(pattern) {
  const parsed = Pattern(pattern);
  const result = guard_exports.IsEqual(parsed.length, 2) ? parsed[0] : [];
  return result;
}

// ../../node_modules/typebox/build/type/engine/template_literal/is_finite.mjs
function FromLiteral(_value) {
  return true;
}
function FromTypesReduce(types) {
  return guard_exports.TakeLeft(types, (left, right) => FromType(left) ? FromTypesReduce(right) : false, () => true);
}
function FromTypes(types) {
  const result = guard_exports.IsEqual(types.length, 0) ? false : FromTypesReduce(types);
  return result;
}
function FromType(type) {
  return IsUnion(type) ? FromTypes(type.anyOf) : IsLiteral(type) ? FromLiteral(type.const) : false;
}
function IsTemplateLiteralFinite(types) {
  const result = FromTypes(types);
  return result;
}

// ../../node_modules/typebox/build/type/engine/template_literal/create.mjs
function TemplateLiteralCreate(pattern) {
  return memory_exports.Create({ ["~kind"]: "TemplateLiteral" }, { type: "string", pattern }, {});
}

// ../../node_modules/typebox/build/type/engine/template_literal/decode.mjs
function FromLiteralPush(variants, value, result = []) {
  return guard_exports.TakeLeft(variants, (left, right) => FromLiteralPush(right, value, [...result, `${left}${value}`]), () => result);
}
function FromLiteral2(variants, value) {
  return guard_exports.IsEqual(variants.length, 0) ? [`${value}`] : FromLiteralPush(variants, value);
}
function FromUnion(variants, types, result = []) {
  return guard_exports.TakeLeft(types, (left, right) => FromUnion(variants, right, [...result, ...FromType2(variants, left)]), () => result);
}
function FromType2(variants, type) {
  const result = IsUnion(type) ? FromUnion(variants, type.anyOf) : IsLiteral(type) ? FromLiteral2(variants, type.const) : Unreachable();
  return result;
}
function DecodeFromSpan(variants, types) {
  return guard_exports.TakeLeft(types, (left, right) => DecodeFromSpan(FromType2(variants, left), right), () => variants);
}
function VariantsToLiterals(variants) {
  return variants.map((variant) => Literal(variant));
}
function DecodeTypesAsUnion(types) {
  const variants = DecodeFromSpan([], types);
  const literals = VariantsToLiterals(variants);
  const result = Union(literals);
  return result;
}
function DecodeTypes(types) {
  return guard_exports.IsEqual(types.length, 0) ? Unreachable() : (
    // Literal('') :
    guard_exports.IsEqual(types.length, 1) && IsLiteral(types[0]) ? types[0] : DecodeTypesAsUnion(types)
  );
}
function TemplateLiteralDecodeUnsafe(pattern) {
  const types = ParsePatternIntoTypes(pattern);
  const result = guard_exports.IsEqual(types.length, 0) ? String2() : IsTemplateLiteralFinite(types) ? DecodeTypes(types) : TemplateLiteralCreate(pattern);
  return result;
}
function TemplateLiteralDecode(pattern) {
  const decoded = TemplateLiteralDecodeUnsafe(pattern);
  const result = IsTemplateLiteral(decoded) ? String2() : decoded;
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/record_create.mjs
function CreateRecord(key, value) {
  const type = "object";
  const patternProperties = { [key]: value };
  return memory_exports.Create({ ["~kind"]: "Record" }, { type, patternProperties });
}

// ../../node_modules/typebox/build/type/engine/record/from_key_any.mjs
function FromAnyKey(value) {
  return CreateRecord(StringKey, value);
}

// ../../node_modules/typebox/build/type/engine/record/from_key_boolean.mjs
function FromBooleanKey(value) {
  return _Object_({ true: value, false: value });
}

// ../../node_modules/typebox/build/type/engine/enum/enum_to_union.mjs
function FromEnumValue(value) {
  return guard_exports.IsString(value) || guard_exports.IsNumber(value) ? Literal(value) : guard_exports.IsNull(value) ? Null() : Never();
}
function EnumValuesToVariants(values) {
  const result = values.map((value) => FromEnumValue(value));
  return result;
}
function EnumValuesToUnion(values) {
  const variants = EnumValuesToVariants(values);
  const result = Union(variants);
  return result;
}
function EnumToUnion(type) {
  const result = EnumValuesToUnion(type.enum);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_enum.mjs
function FromEnumKey(values, value) {
  const unionKey = EnumValuesToUnion(values);
  const result = FromKey(unionKey, value);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_integer.mjs
function FromIntegerKey(_key, value) {
  const result = CreateRecord(IntegerKey, value);
  return result;
}

// ../../node_modules/typebox/build/type/types/tuple.mjs
function Tuple(types, options = {}) {
  const [items, minItems, additionalItems] = [types, types.length, false];
  return memory_exports.Create({ ["~kind"]: "Tuple" }, { type: "array", additionalItems, items, minItems }, options);
}
function IsTuple(value) {
  return IsKind(value, "Tuple");
}
function TupleOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "items", "minItems", "additionalItems"]);
}

// ../../node_modules/typebox/build/type/engine/tuple/to_object.mjs
function TupleElementsToProperties(types) {
  const result = types.reduceRight((result2, right, index) => {
    return { [index]: right, ...result2 };
  }, {});
  return result;
}
function TupleToObject(type) {
  const properties = TupleElementsToProperties(type.items);
  const result = _Object_(properties);
  return result;
}

// ../../node_modules/typebox/build/type/engine/evaluate/composite.mjs
function IsReadonlyProperty(left, right) {
  return IsReadonly(left) ? IsReadonly(right) ? true : false : false;
}
function IsOptionalProperty(left, right) {
  return IsOptional(left) ? IsOptional(right) ? true : false : false;
}
function CompositeProperty(left, right) {
  const isReadonly = IsReadonlyProperty(left, right);
  const isOptional = IsOptionalProperty(left, right);
  const evaluated = EvaluateIntersect([left, right]);
  const property = ReadonlyRemove(OptionalRemove(evaluated));
  return isReadonly && isOptional ? ReadonlyAdd(OptionalAdd(property)) : isReadonly && !isOptional ? ReadonlyAdd(property) : !isReadonly && isOptional ? OptionalAdd(property) : property;
}
function CompositePropertyKey(left, right, key) {
  return key in left ? key in right ? CompositeProperty(left[key], right[key]) : left[key] : key in right ? right[key] : Never();
}
function CompositeProperties(left, right) {
  const keys = /* @__PURE__ */ new Set([...guard_exports.Keys(right), ...guard_exports.Keys(left)]);
  return [...keys].reduce((result, key) => {
    return { ...result, [key]: CompositePropertyKey(left, right, key) };
  }, {});
}
function GetProperties(type) {
  const result = IsObject2(type) ? type.properties : IsTuple(type) ? TupleElementsToProperties(type.items) : Unreachable();
  return result;
}
function Composite(left, right) {
  const leftProperties = GetProperties(left);
  const rightProperties = GetProperties(right);
  const properties = CompositeProperties(leftProperties, rightProperties);
  return _Object_(properties);
}

// ../../node_modules/typebox/build/type/engine/evaluate/narrow.mjs
function Narrow(left, right) {
  const result = Compare(left, right);
  return guard_exports.IsEqual(result, ResultLeftInside) ? left : guard_exports.IsEqual(result, ResultRightInside) ? right : guard_exports.IsEqual(result, ResultEqual) ? right : Never();
}

// ../../node_modules/typebox/build/type/engine/evaluate/distribute.mjs
function IsObjectLike(type) {
  return IsObject2(type) || IsTuple(type);
}
function IsUnionOperand(left, right) {
  const isUnionLeft = IsUnion(left);
  const isUnionRight = IsUnion(right);
  const result = isUnionLeft || isUnionRight;
  return result;
}
function DistributeOperation(left, right) {
  const evaluatedLeft = EvaluateType(left);
  const evaluatedRight = EvaluateType(right);
  const isUnionOperand = IsUnionOperand(evaluatedLeft, evaluatedRight);
  const isObjectLeft = IsObjectLike(evaluatedLeft);
  const IsObjectRight = IsObjectLike(evaluatedRight);
  const result = isUnionOperand ? EvaluateIntersect([evaluatedLeft, evaluatedRight]) : isObjectLeft && IsObjectRight ? Composite(evaluatedLeft, evaluatedRight) : isObjectLeft && !IsObjectRight ? evaluatedLeft : !isObjectLeft && IsObjectRight ? evaluatedRight : Narrow(evaluatedLeft, evaluatedRight);
  return result;
}
function DistributeType(type, types, result = []) {
  return guard_exports.TakeLeft(types, (left, right) => DistributeType(type, right, [...result, DistributeOperation(type, left)]), () => guard_exports.IsEqual(result.length, 0) ? [type] : result);
}
function DistributeUnion(types, distribution, result = []) {
  return guard_exports.TakeLeft(types, (left, right) => DistributeUnion(right, distribution, [...result, ...Distribute([left], distribution)]), () => result);
}
function Distribute(types, result = []) {
  return guard_exports.TakeLeft(types, (left, right) => IsUnion(left) ? Distribute(right, DistributeUnion(left.anyOf, result)) : Distribute(right, DistributeType(left, result)), () => result);
}

// ../../node_modules/typebox/build/type/engine/evaluate/evaluate.mjs
function EvaluateIntersect(types) {
  const distribution = Distribute(types);
  const result = Broaden(distribution);
  return result;
}
function EvaluateUnion(types) {
  const result = Broaden(types);
  return result;
}
function EvaluateType(type) {
  return IsIntersect(type) ? EvaluateIntersect(type.allOf) : IsUnion(type) ? EvaluateUnion(type.anyOf) : type;
}
function EvaluateUnionFast(types) {
  const result = guard_exports.IsEqual(types.length, 1) ? types[0] : guard_exports.IsEqual(types.length, 0) ? Never() : Union(types);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_intersect.mjs
function FromIntersectKey(types, value) {
  const evaluatedKey = EvaluateIntersect(types);
  const result = FromKey(evaluatedKey, value);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_literal.mjs
function FromLiteralKey(key, value) {
  return guard_exports.IsString(key) || guard_exports.IsNumber(key) ? _Object_({ [key]: value }) : guard_exports.IsEqual(key, false) ? _Object_({ false: value }) : guard_exports.IsEqual(key, true) ? _Object_({ true: value }) : _Object_({});
}

// ../../node_modules/typebox/build/type/engine/record/from_key_number.mjs
function FromNumberKey(_key, value) {
  const result = CreateRecord(NumberKey, value);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_string.mjs
function FromStringKey(key, value) {
  return guard_exports.HasPropertyKey(key, "pattern") && (guard_exports.IsString(key.pattern) || key.pattern instanceof RegExp) ? CreateRecord(key.pattern.toString(), value) : CreateRecord(StringKey, value);
}

// ../../node_modules/typebox/build/type/engine/record/from_key_template_literal.mjs
function FromTemplateKey(pattern, value) {
  const types = ParsePatternIntoTypes(pattern);
  const finite = IsTemplateLiteralFinite(types);
  const result = finite ? FromKey(TemplateLiteralDecode(pattern), value) : CreateRecord(pattern, value);
  return result;
}

// ../../node_modules/typebox/build/type/engine/evaluate/flatten.mjs
function FlattenType(type) {
  const result = IsUnion(type) ? Flatten(type.anyOf) : [type];
  return result;
}
function Flatten(types) {
  return types.reduce((result, type) => {
    return [...result, ...FlattenType(type)];
  }, []);
}

// ../../node_modules/typebox/build/type/engine/record/from_key_union.mjs
function StringOrNumberCheck(types) {
  return types.some((type) => IsString2(type) || IsNumber2(type) || IsInteger2(type));
}
function TryBuildRecord(types, value) {
  return guard_exports.IsEqual(StringOrNumberCheck(types), true) ? CreateRecord(StringKey, value) : void 0;
}
function CreateProperties(types, value) {
  return types.reduce((result, left) => {
    return IsLiteral(left) && (guard_exports.IsString(left.const) || guard_exports.IsNumber(left.const)) ? { ...result, [left.const]: value } : result;
  }, {});
}
function CreateObject(types, value) {
  const properties = CreateProperties(types, value);
  const result = _Object_(properties);
  return result;
}
function FromUnionKey(types, value) {
  const flattened = Flatten(types);
  const record = TryBuildRecord(flattened, value);
  return IsSchema(record) ? record : CreateObject(flattened, value);
}

// ../../node_modules/typebox/build/type/engine/record/from_key.mjs
function FromKey(key, value) {
  const result = IsAny(key) ? FromAnyKey(value) : IsBoolean2(key) ? FromBooleanKey(value) : IsEnum(key) ? FromEnumKey(key.enum, value) : IsInteger2(key) ? FromIntegerKey(key, value) : IsIntersect(key) ? FromIntersectKey(key.allOf, value) : IsLiteral(key) ? FromLiteralKey(key.const, value) : IsNumber2(key) ? FromNumberKey(key, value) : IsUnion(key) ? FromUnionKey(key.anyOf, value) : IsString2(key) ? FromStringKey(key, value) : IsTemplateLiteral(key) ? FromTemplateKey(key.pattern, value) : _Object_({});
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/instantiate.mjs
function RecordAction(key, value, options) {
  const result = CanInstantiate([key]) ? memory_exports.Update(FromKey(key, value), {}, options) : RecordDeferred(key, value, options);
  return result;
}
function RecordInstantiate(context, state, key, value, options) {
  const instantiatedKey = InstantiateType(context, state, key);
  const instantiatedValue = InstantiateType(context, state, value);
  return RecordAction(instantiatedKey, instantiatedValue, options);
}

// ../../node_modules/typebox/build/type/types/record.mjs
var IntegerKey = `^${IntegerPattern}$`;
var NumberKey = `^${NumberPattern}$`;
var StringKey = `^${StringPattern}$`;
function RecordDeferred(key, value, options = {}) {
  return Deferred("Record", [key, value], options);
}
function Record(key, value, options = {}) {
  return RecordAction(key, value, options);
}
function RecordFromPattern(key, value) {
  return CreateRecord(key, value);
}
function RecordPattern(type) {
  return guard_exports.Keys(type.patternProperties)[0];
}
function RecordKey(type) {
  const pattern = RecordPattern(type);
  const result = guard_exports.IsEqual(pattern, StringKey) ? String2() : guard_exports.IsEqual(pattern, IntegerKey) ? Integer() : guard_exports.IsEqual(pattern, NumberKey) ? Number2() : TemplateLiteralDecodeUnsafe(pattern);
  return result;
}
function RecordValue(type) {
  return type.patternProperties[RecordPattern(type)];
}
function IsRecord(value) {
  return IsKind(value, "Record");
}

// ../../node_modules/typebox/build/type/types/rest.mjs
function Rest(type) {
  return memory_exports.Create({ "~kind": "Rest" }, { type: "rest", items: type }, {});
}
function IsRest(value) {
  return IsKind(value, "Rest");
}

// ../../node_modules/typebox/build/type/types/this.mjs
function This(options) {
  return memory_exports.Create({ ["~kind"]: "This" }, { $ref: "#" }, options);
}
function IsThis(value) {
  return IsKind(value, "This");
}

// ../../node_modules/typebox/build/type/types/undefined.mjs
function Undefined(options) {
  return memory_exports.Create({ "~kind": "Undefined" }, { type: "undefined" }, options);
}
function IsUndefined2(value) {
  return IsKind(value, "Undefined");
}

// ../../node_modules/typebox/build/type/types/void.mjs
function Void(options) {
  return memory_exports.Create({ "~kind": "Void" }, { type: "void" }, options);
}
function IsVoid(value) {
  return IsKind(value, "Void");
}

// ../../node_modules/typebox/build/type/script/mapping.mjs
function IntrinsicOrCall(ref, parameters) {
  return guard_exports.IsEqual(ref, "Array") ? _Array_(parameters[0]) : guard_exports.IsEqual(ref, "AsyncIterator") ? AsyncIterator(parameters[0]) : guard_exports.IsEqual(ref, "Iterator") ? Iterator(parameters[0]) : guard_exports.IsEqual(ref, "Promise") ? _Promise_(parameters[0]) : guard_exports.IsEqual(ref, "Awaited") ? AwaitedDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Capitalize") ? CapitalizeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "ConstructorParameters") ? ConstructorParametersDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Evaluate") ? EvaluateDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Exclude") ? ExcludeDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Extract") ? ExtractDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Index") ? IndexDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "InstanceType") ? InstanceTypeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Lowercase") ? LowercaseDeferred(parameters[0]) : guard_exports.IsEqual(ref, "NonNullable") ? NonNullableDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Omit") ? OmitDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Options") ? OptionsDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Parameters") ? ParametersDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Partial") ? PartialDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Pick") ? PickDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Readonly") ? ReadonlyObjectDeferred(parameters[0]) : guard_exports.IsEqual(ref, "KeyOf") ? KeyOfDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Record") ? RecordDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Required") ? RequiredDeferred(parameters[0]) : guard_exports.IsEqual(ref, "ReturnType") ? ReturnTypeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Uncapitalize") ? UncapitalizeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Uppercase") ? UppercaseDeferred(parameters[0]) : CallConstruct(Ref(ref), parameters);
}
function Unreachable2() {
  throw Error("Unreachable");
}
var DelimitedDecode = (input, result = []) => {
  return input.reduce((result2, left) => {
    return guard_exports.IsArray(left) && guard_exports.IsEqual(left.length, 2) ? [...result2, left[0]] : [...result2, left];
  }, []);
};
var Delimited = (input) => {
  const [left, right] = input;
  return DelimitedDecode([...left, ...right]);
};
function GenericParameterExtendsEqualsMapping(input) {
  return Parameter(input[0], input[2], input[4]);
}
function GenericParameterExtendsMapping(input) {
  return Parameter(input[0], input[2], input[2]);
}
function GenericParameterEqualsMapping(input) {
  return Parameter(input[0], Unknown(), input[2]);
}
function GenericParameterIdentifierMapping(input) {
  return Parameter(input, Unknown(), Unknown());
}
function GenericParameterMapping(input) {
  return input;
}
function GenericParameterListMapping(input) {
  return Delimited(input);
}
function GenericParametersMapping(input) {
  return input[1];
}
function GenericCallArgumentListMapping(input) {
  return Delimited(input);
}
function GenericCallArgumentsMapping(input) {
  return input[1];
}
function GenericCallMapping(input) {
  return IntrinsicOrCall(input[0], input[1]);
}
function OptionalSemiColonMapping(input) {
  return null;
}
function KeywordStringMapping(input) {
  return String2();
}
function KeywordNumberMapping(input) {
  return Number2();
}
function KeywordBooleanMapping(input) {
  return Boolean2();
}
function KeywordUndefinedMapping(input) {
  return Undefined();
}
function KeywordNullMapping(input) {
  return Null();
}
function KeywordIntegerMapping(input) {
  return Integer();
}
function KeywordBigIntMapping(input) {
  return BigInt2();
}
function KeywordUnknownMapping(input) {
  return Unknown();
}
function KeywordAnyMapping(input) {
  return Any();
}
function KeywordObjectMapping(input) {
  return _Object_({});
}
function KeywordNeverMapping(input) {
  return Never();
}
function KeywordSymbolMapping(input) {
  return Symbol2();
}
function KeywordVoidMapping(input) {
  return Void();
}
function KeywordThisMapping(input) {
  return This();
}
function KeywordMapping(input) {
  return input;
}
function TemplateInterpolateMapping(input) {
  return input[1];
}
function TemplateSpanMapping(input) {
  return Literal(input);
}
function TemplateBodyMapping(input) {
  return guard_exports.IsEqual(input.length, 3) ? [input[0], input[1], ...input[2]] : [input[0]];
}
function TemplateLiteralTypesMapping(input) {
  return input[1];
}
function TemplateLiteralMapping(input) {
  return TemplateLiteralDeferred(input);
}
function LiteralBigIntMapping(input) {
  return Literal(BigInt(input));
}
function LiteralBooleanMapping(input) {
  return Literal(guard_exports.IsEqual(input, "true"));
}
function LiteralNumberMapping(input) {
  return Literal(parseFloat(input));
}
function LiteralStringMapping(input) {
  return Literal(input);
}
function LiteralMapping(input) {
  return input;
}
function KeyOfMapping(input) {
  return input.length > 0;
}
function IndexArrayMapping(input) {
  return input.reduce((result, current) => {
    return guard_exports.IsEqual(current.length, 3) ? [...result, [current[1]]] : [...result, []];
  }, []);
}
function ExtendsMapping(input) {
  return guard_exports.IsEqual(input.length, 6) ? [input[1], input[3], input[5]] : [];
}
function BaseMapping(input) {
  return guard_exports.IsArray(input) && guard_exports.IsEqual(input.length, 3) ? input[1] : input;
}
var FactorIndexArray = (Type2, indexArray) => {
  return indexArray.reduce((result, left) => {
    const _left = left;
    return guard_exports.IsEqual(_left.length, 1) ? IndexDeferred(result, _left[0]) : guard_exports.IsEqual(_left.length, 0) ? _Array_(result) : Unreachable2();
  }, Type2);
};
var FactorExtends = (type, extend) => {
  return guard_exports.IsEqual(extend.length, 3) ? ConditionalDeferred(type, extend[0], extend[1], extend[2]) : type;
};
function FactorMapping(input) {
  const [keyOf, type, indexArray, extend] = input;
  return keyOf ? FactorExtends(KeyOfDeferred(FactorIndexArray(type, indexArray)), extend) : FactorExtends(FactorIndexArray(type, indexArray), extend);
}
function ExprBinaryMapping(left, rest) {
  return guard_exports.IsEqual(rest.length, 3) ? (() => {
    const [operator, right, next] = rest;
    const Schema = ExprBinaryMapping(right, next);
    if (guard_exports.IsEqual(operator, "&")) {
      return IsIntersect(Schema) ? Intersect([left, ...Schema.allOf]) : Intersect([left, Schema]);
    }
    if (guard_exports.IsEqual(operator, "|")) {
      return IsUnion(Schema) ? Union([left, ...Schema.anyOf]) : Union([left, Schema]);
    }
    Unreachable2();
  })() : left;
}
function ExprTermTailMapping(input) {
  return input;
}
function ExprTermMapping(input) {
  const [left, rest] = input;
  return ExprBinaryMapping(left, rest);
}
function ExprTailMapping(input) {
  return input;
}
function ExprMapping(input) {
  const [left, rest] = input;
  return ExprBinaryMapping(left, rest);
}
function ExprReadonlyMapping(input) {
  return ImmutableAdd(input[1]);
}
function ExprPipeMapping(input) {
  return input[1];
}
function GenericTypeMapping(input) {
  return Generic(input[0], input[2]);
}
function InferTypeMapping(input) {
  return guard_exports.IsEqual(input.length, 4) ? Infer(input[1], input[3]) : guard_exports.IsEqual(input.length, 2) ? Infer(input[1], Unknown()) : Unreachable2();
}
function TypeMapping(input) {
  return input;
}
function PropertyKeyNumberMapping(input) {
  return `${input}`;
}
function PropertyKeyIdentMapping(input) {
  return input;
}
function PropertyKeyQuotedMapping(input) {
  return input;
}
function PropertyKeyIndexMapping(input) {
  return IsInteger2(input[3]) ? IntegerKey : IsNumber2(input[3]) ? NumberKey : IsSymbol2(input[3]) ? StringKey : IsString2(input[3]) ? StringKey : Unreachable2();
}
function PropertyKeyMapping(input) {
  return input;
}
function ReadonlyMapping(input) {
  return input.length > 0;
}
function OptionalMapping(input) {
  return input.length > 0;
}
function PropertyMapping(input) {
  const [isReadonly, key, isOptional, _colon, type] = input;
  return {
    [key]: isReadonly && isOptional ? ReadonlyAdd(OptionalAdd(type)) : isReadonly && !isOptional ? ReadonlyAdd(type) : !isReadonly && isOptional ? OptionalAdd(type) : type
  };
}
function PropertyDelimiterMapping(input) {
  return input;
}
function PropertyListMapping(input) {
  return Delimited(input);
}
function PropertiesReduce(propertyList) {
  return propertyList.reduce((result, left) => {
    const isPatternProperties = guard_exports.HasPropertyKey(left, IntegerKey) || guard_exports.HasPropertyKey(left, NumberKey) || guard_exports.HasPropertyKey(left, StringKey);
    return isPatternProperties ? [result[0], memory_exports.Assign(result[1], left)] : [memory_exports.Assign(result[0], left), result[1]];
  }, [{}, {}]);
}
function PropertiesMapping(input) {
  return PropertiesReduce(input[1]);
}
function _Object_Mapping(input) {
  const [properties, patternProperties] = input;
  const options = guard_exports.IsEqual(guard_exports.Keys(patternProperties).length, 0) ? {} : { patternProperties };
  return _Object_(properties, options);
}
function ElementNamedMapping(input) {
  return guard_exports.IsEqual(input.length, 5) ? ReadonlyAdd(OptionalAdd(input[4])) : guard_exports.IsEqual(input.length, 3) ? input[2] : guard_exports.IsEqual(input.length, 4) ? guard_exports.IsEqual(input[2], "readonly") ? ReadonlyAdd(input[3]) : OptionalAdd(input[3]) : Unreachable2();
}
function ElementReadonlyOptionalMapping(input) {
  return ReadonlyAdd(OptionalAdd(input[1]));
}
function ElementReadonlyMapping(input) {
  return ReadonlyAdd(input[1]);
}
function ElementOptionalMapping(input) {
  return OptionalAdd(input[0]);
}
function ElementBaseMapping(input) {
  return input;
}
function ElementMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? Rest(input[1]) : guard_exports.IsEqual(input.length, 1) ? input[0] : Unreachable2();
}
function ElementListMapping(input) {
  return Delimited(input);
}
function TupleMapping(input) {
  return Tuple(input[1]);
}
function ParameterReadonlyOptionalMapping(input) {
  return ReadonlyAdd(OptionalAdd(input[4]));
}
function ParameterReadonlyMapping(input) {
  return ReadonlyAdd(input[3]);
}
function ParameterOptionalMapping(input) {
  return OptionalAdd(input[3]);
}
function ParameterTypeMapping(input) {
  return input[2];
}
function ParameterBaseMapping(input) {
  return input;
}
function ParameterMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? Rest(input[1]) : guard_exports.IsEqual(input.length, 1) ? input[0] : Unreachable2();
}
function ParameterListMapping(input) {
  return Delimited(input);
}
function _Function_Mapping(input) {
  return _Function_(input[1], input[4]);
}
function ConstructorMapping(input) {
  return Constructor(input[2], input[5]);
}
function ApplyReadonly(state, type) {
  return guard_exports.IsEqual(state, "remove") ? ReadonlyRemoveAction(type) : guard_exports.IsEqual(state, "add") ? ReadonlyAddAction(type) : type;
}
function MappedReadonlyMapping(input) {
  return guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "-") ? "remove" : guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "+") ? "add" : guard_exports.IsEqual(input.length, 1) ? "add" : "none";
}
function ApplyOptional(state, type) {
  return guard_exports.IsEqual(state, "remove") ? OptionalRemoveAction(type) : guard_exports.IsEqual(state, "add") ? OptionalAddAction(type) : type;
}
function MappedOptionalMapping(input) {
  return guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "-") ? "remove" : guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "+") ? "add" : guard_exports.IsEqual(input.length, 1) ? "add" : "none";
}
function MappedAsMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? [input[1]] : [];
}
function MappedMapping(input) {
  return guard_exports.IsArray(input[6]) && guard_exports.IsEqual(input[6].length, 1) ? MappedDeferred(Identifier(input[3]), input[5], input[6][0], ApplyReadonly(input[1], ApplyOptional(input[8], input[10]))) : MappedDeferred(Identifier(input[3]), input[5], Ref(input[3]), ApplyReadonly(input[1], ApplyOptional(input[8], input[10])));
}
function ReferenceMapping(input) {
  return Ref(input);
}
function OptionsMapping(input) {
  return OptionsDeferred(input[2], input[4]);
}
function JsonNumberMapping(input) {
  return parseFloat(input);
}
function JsonBooleanMapping(input) {
  return guard_exports.IsEqual(input, "true");
}
function JsonStringMapping(input) {
  return input;
}
function JsonNullMapping(input) {
  return null;
}
function JsonPropertyMapping(input) {
  return { [input[0]]: input[2] };
}
function JsonPropertyListMapping(input) {
  return Delimited(input);
}
function JsonObjectMappingReduce(propertyList) {
  return propertyList.reduce((result, left) => {
    return memory_exports.Assign(result, left);
  }, {});
}
function JsonObjectMapping(input) {
  return JsonObjectMappingReduce(input[1]);
}
function JsonElementListMapping(input) {
  return Delimited(input);
}
function JsonArrayMapping(input) {
  return input[1];
}
function JsonMapping(input) {
  return input;
}
function PatternBigIntMapping(input) {
  return BigInt2();
}
function PatternStringMapping(input) {
  return String2();
}
function PatternNumberMapping(input) {
  return Number2();
}
function PatternIntegerMapping(input) {
  return Integer();
}
function PatternNeverMapping(input) {
  return Never();
}
function PatternTextMapping(input) {
  return Literal(input);
}
function PatternBaseMapping(input) {
  return input;
}
function PatternGroupMapping(input) {
  return Union(input[1]);
}
function PatternUnionMapping(input) {
  return input.length === 3 ? [...input[0], ...input[2]] : input.length === 1 ? [...input[0]] : [];
}
function PatternTermMapping(input) {
  return [input[0], ...input[1]];
}
function PatternBodyMapping(input) {
  return input;
}
function PatternMapping(input) {
  return input[1];
}
function InterfaceDeclarationHeritageListMapping(input) {
  return Delimited(input);
}
function InterfaceDeclarationHeritageMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? input[1] : [];
}
function InterfaceDeclarationGenericMapping(input) {
  const parameters = input[2];
  const heritage = input[3];
  const [properties, patternProperties] = input[4];
  const options = guard_exports.IsEqual(guard_exports.Keys(patternProperties).length, 0) ? {} : { patternProperties };
  return { [input[1]]: Generic(parameters, InterfaceDeferred(heritage, properties, options)) };
}
function InterfaceDeclarationMapping(input) {
  const heritage = input[2];
  const [properties, patternProperties] = input[3];
  const options = guard_exports.IsEqual(guard_exports.Keys(patternProperties).length, 0) ? {} : { patternProperties };
  return { [input[1]]: InterfaceDeferred(heritage, properties, options) };
}
function TypeAliasDeclarationGenericMapping(input) {
  return { [input[1]]: Generic(input[2], input[4]) };
}
function TypeAliasDeclarationMapping(input) {
  return { [input[1]]: input[3] };
}
function ExportKeywordMapping(input) {
  return null;
}
function ModuleDeclarationDelimiterMapping(input) {
  return input;
}
function ModuleDeclarationListMapping(input) {
  return PropertiesReduce(Delimited(input));
}
function ModuleDeclarationMapping(input) {
  return input[1];
}
function ModuleMapping(input) {
  const moduleDeclaration = input[0];
  const moduleDeclarationList = input[1];
  return ModuleDeferred(memory_exports.Assign(moduleDeclaration, moduleDeclarationList[0]));
}
function ScriptMapping(input) {
  return input;
}

// ../../node_modules/typebox/build/type/script/token/internal/match.mjs
function IsMatch(value) {
  return IsEqual(value.length, 2);
}
function Match2(input, ok, fail) {
  return IsMatch(input) ? ok(input[0], input[1]) : fail();
}

// ../../node_modules/typebox/build/type/script/token/internal/take.mjs
function TakeVariant(variant, input) {
  return IsEqual(input.indexOf(variant), 0) ? [variant, input.slice(variant.length)] : [];
}
function Take(variants, input) {
  for (let i = 0; i < variants.length; i++) {
    const result = TakeVariant(variants[i], input);
    if (IsMatch(result))
      return result;
  }
  return [];
}

// ../../node_modules/typebox/build/type/script/token/internal/char.mjs
function Range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => String.fromCharCode(start + i));
}
var Alpha = [
  ...Range(97, 122),
  // Lowercase
  ...Range(65, 90)
  // Uppercase
];
var Zero = "0";
var NonZero = Range(49, 57);
var Digit = [Zero, ...NonZero];
var WhiteSpace = " ";
var NewLine = "\n";
var UnderScore = "_";
var Dot = ".";
var DollarSign = "$";
var Hyphen = "-";

// ../../node_modules/typebox/build/type/script/token/internal/trim.mjs
var LineComment = "//";
var OpenComment = "/*";
var CloseComment = "*/";
function DiscardMultilineComment(input) {
  const index = input.indexOf(CloseComment);
  const result = IsEqual(index, -1) ? "" : input.slice(index + 2);
  return result;
}
function DiscardLineComment(input) {
  const index = input.indexOf(NewLine);
  const result = IsEqual(index, -1) ? "" : input.slice(index);
  return result;
}
function TrimStartUntilNewline(input) {
  return input.replace(/^[ \t\r\f\v]+/, "");
}
function TrimWhitespace(input) {
  const trimmed = TrimStartUntilNewline(input);
  return trimmed.startsWith(OpenComment) ? TrimWhitespace(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? TrimWhitespace(DiscardLineComment(trimmed.slice(2))) : trimmed;
}
function Trim(input) {
  const trimmed = input.trimStart();
  return trimmed.startsWith(OpenComment) ? Trim(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? Trim(DiscardLineComment(trimmed.slice(2))) : trimmed;
}

// ../../node_modules/typebox/build/type/script/token/internal/optional.mjs
function Optional2(value, input) {
  return Match2(Take([value], input), (Optional4, Rest2) => [Optional4, Rest2], () => ["", input]);
}

// ../../node_modules/typebox/build/type/script/token/internal/many.mjs
function IsDiscard(discard, input) {
  return discard.includes(input);
}
function Many(allowed, discard, input, result = "") {
  return Match2(Take(allowed, input), (Char, Rest2) => IsDiscard(discard, Char) ? Many(allowed, discard, Rest2, result) : Many(allowed, discard, Rest2, `${result}${Char}`), () => [result, input]);
}

// ../../node_modules/typebox/build/type/script/token/unsigned_integer.mjs
function TakeNonZero(input) {
  return Take(NonZero, input);
}
var AllowedDigits = [...Digit, UnderScore];
function TakeDigits(input) {
  return Many(AllowedDigits, [UnderScore], input);
}
function TakeUnsignedInteger(input) {
  return Match2(Take([Zero], input), (Zero2, ZeroRest) => [Zero2, ZeroRest], () => Match2(
    TakeNonZero(input),
    (NonZero2, NonZeroRest) => Match2(TakeDigits(NonZeroRest), (Digits, DigitsRest) => [`${NonZero2}${Digits}`, DigitsRest], () => []),
    // fail: did not match Digits
    () => []
  ));
}
function UnsignedInteger(input) {
  return TakeUnsignedInteger(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/integer.mjs
function TakeSign(input) {
  return Optional2(Hyphen, input);
}
function TakeSignedInteger(input) {
  return Match2(
    TakeSign(input),
    (Sign, SignRest) => Match2(UnsignedInteger(SignRest), (UnsignedInteger2, UnsignedIntegerRest) => [`${Sign}${UnsignedInteger2}`, UnsignedIntegerRest], () => []),
    // fail: did not match unsigned integer
    () => []
  );
}
function Integer2(input) {
  return TakeSignedInteger(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/bigint.mjs
function TakeBigInt(input) {
  return Match2(
    Integer2(input),
    (Integer3, IntegerRest) => Match2(Take(["n"], IntegerRest), (_N, NRest) => [`${Integer3}`, NRest], () => []),
    // fail: did not match 'n'
    () => []
  );
}
function BigInt3(input) {
  return TakeBigInt(input);
}

// ../../node_modules/typebox/build/type/script/token/const.mjs
function TakeConst(const_, input) {
  return Take([const_], input);
}
function Const(const_, input) {
  return IsEqual(const_, "") ? ["", input] : const_.startsWith(NewLine) ? TakeConst(const_, TrimWhitespace(input)) : const_.startsWith(WhiteSpace) ? TakeConst(const_, input) : TakeConst(const_, Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/ident.mjs
var Initial = [...Alpha, UnderScore, DollarSign];
function TakeInitial(input) {
  return Take(Initial, input);
}
var Remaining = [...Initial, ...Digit];
function TakeRemaining(input, result = "") {
  return Match2(Take(Remaining, input), (Remaining2, RemainingRest) => TakeRemaining(RemainingRest, `${result}${Remaining2}`), () => [result, input]);
}
function TakeIdent(input) {
  return Match2(
    TakeInitial(input),
    (Initial2, InitialRest) => Match2(TakeRemaining(InitialRest), (Remaining2, RemainingRest) => [`${Initial2}${Remaining2}`, RemainingRest], () => []),
    // fail: did not match Remaining
    () => []
  );
}
function Ident(input) {
  return TakeIdent(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/unsigned_number.mjs
var AllowedDigits2 = [...Digit, UnderScore];
function IsLeadingDot(input) {
  return IsMatch(Take([Dot], input));
}
function TakeFractional(input) {
  return Match2(Many(AllowedDigits2, [UnderScore], input), (Digits, DigitsRest) => IsEqual(Digits, "") ? [] : [Digits, DigitsRest], () => []);
}
function LeadingDot(input) {
  return Match2(
    Take([Dot], input),
    (Dot2, DotRest) => Match2(TakeFractional(DotRest), (Fractional, FractionalRest) => [`0${Dot2}${Fractional}`, FractionalRest], () => []),
    // fail: did not match Fractional
    () => []
  );
}
function LeadingInteger(input) {
  return Match2(
    UnsignedInteger(input),
    (Integer3, IntegerRest) => Match2(
      Take([Dot], IntegerRest),
      (Dot2, DotRest) => Match2(TakeFractional(DotRest), (Fractional, FractionalRest) => [`${Integer3}${Dot2}${Fractional}`, FractionalRest], () => [`${Integer3}`, DotRest]),
      // fail: did not match Fractional, use Integer
      () => [`${Integer3}`, IntegerRest]
    ),
    // fail: did not match Dot, use Integer
    () => []
  );
}
function TakeUnsignedNumber(input) {
  return IsLeadingDot(input) ? LeadingDot(input) : LeadingInteger(input);
}
function UnsignedNumber(input) {
  return TakeUnsignedNumber(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/number.mjs
function TakeSign2(input) {
  return Optional2(Hyphen, input);
}
function TakeSignedNumber(input) {
  return Match2(
    TakeSign2(input),
    (Sign, SignRest) => Match2(UnsignedNumber(SignRest), (UnsignedInteger2, UnsignedIntegerRest) => [`${Sign}${UnsignedInteger2}`, UnsignedIntegerRest], () => []),
    // fail: did not match unsigned integer
    () => []
  );
}
function Number3(input) {
  return TakeSignedNumber(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/until.mjs
function TakeOne(input) {
  const result = IsEqual(input, "") ? [] : [input.slice(0, 1), input.slice(1)];
  return result;
}
function IsInputMatchSentinal(end, input) {
  return TakeLeft(end, (left, right) => input.startsWith(left) ? true : IsInputMatchSentinal(right, input), () => false);
}
function Until(end, input, result = "") {
  return Match2(
    TakeOne(input),
    (One, Rest2) => IsInputMatchSentinal(end, input) ? [result, input] : Until(end, Rest2, `${result}${One}`),
    () => []
  );
}

// ../../node_modules/typebox/build/type/script/token/span.mjs
function MultiLine(start, end, input) {
  return Match2(
    Take([start], input),
    (_, Rest2) => Match2(
      Until([end], Rest2),
      (Until2, UntilRest) => Match2(Take([end], UntilRest), (_2, Rest3) => [`${Until2}`, Rest3], () => []),
      // fail: did not match End
      () => []
    ),
    // fail: did not match Until
    () => []
  );
}
function SingleLine(start, end, input) {
  return Match2(
    Take([start], input),
    (_, Rest2) => Match2(
      Until([NewLine, end], Rest2),
      (Until2, UntilRest) => Match2(Take([end], UntilRest), (_2, EndRest) => [`${Until2}`, EndRest], () => []),
      // fail: did not match End
      () => []
    ),
    // fail: did not match Until
    () => []
  );
}
function Span(start, end, multiLine, input) {
  return multiLine ? MultiLine(start, end, Trim(input)) : SingleLine(start, end, Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/string.mjs
function TakeInitial2(quotes, input) {
  return Take(quotes, input);
}
function TakeSpan(quote, input) {
  return Span(quote, quote, false, input);
}
function TakeString(quotes, input) {
  return Match2(TakeInitial2(quotes, input), (Initial2, InitialRest) => TakeSpan(Initial2, `${Initial2}${InitialRest}`), () => []);
}
function String3(quotes, input) {
  return TakeString(quotes, Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/until_1.mjs
function Until_1(end, input) {
  return Match2(Until(end, input), (Until2, UntilRest) => IsEqual(Until2, "") ? [] : [Until2, UntilRest], () => []);
}

// ../../node_modules/typebox/build/type/script/parser.mjs
var If = (result, left, right = () => []) => result.length === 2 ? left(result) : right();
var GenericParameterExtendsEquals = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("extends", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => If(Const("=", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [GenericParameterExtendsEqualsMapping(_0), input2]);
var GenericParameterExtends = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("extends", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericParameterExtendsMapping(_0), input2]);
var GenericParameterEquals = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("=", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericParameterEqualsMapping(_0), input2]);
var GenericParameterIdentifier = (input) => If(Ident(input), ([_0, input2]) => [GenericParameterIdentifierMapping(_0), input2]);
var GenericParameter = (input) => If(If(GenericParameterExtendsEquals(input), ([_0, input2]) => [_0, input2], () => If(GenericParameterExtends(input), ([_0, input2]) => [_0, input2], () => If(GenericParameterEquals(input), ([_0, input2]) => [_0, input2], () => If(GenericParameterIdentifier(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [GenericParameterMapping(_0), input2]);
var GenericParameterList_0 = (input, result = []) => If(If(GenericParameter(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => GenericParameterList_0(input2, [...result, _0]), () => [result, input]);
var GenericParameterList = (input) => If(If(GenericParameterList_0(input), ([_0, input2]) => If(If(If(GenericParameter(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [GenericParameterListMapping(_0), input2]);
var GenericParameters = (input) => If(If(Const("<", input), ([_0, input2]) => If(GenericParameterList(input2), ([_1, input3]) => If(Const(">", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericParametersMapping(_0), input2]);
var GenericCallArgumentList_0 = (input, result = []) => If(If(Type(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => GenericCallArgumentList_0(input2, [...result, _0]), () => [result, input]);
var GenericCallArgumentList = (input) => If(If(GenericCallArgumentList_0(input), ([_0, input2]) => If(If(If(Type(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [GenericCallArgumentListMapping(_0), input2]);
var GenericCallArguments = (input) => If(If(Const("<", input), ([_0, input2]) => If(GenericCallArgumentList(input2), ([_1, input3]) => If(Const(">", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericCallArgumentsMapping(_0), input2]);
var GenericCall = (input) => If(If(Ident(input), ([_0, input2]) => If(GenericCallArguments(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [GenericCallMapping(_0), input2]);
var OptionalSemiColon = (input) => If(If(If(Const(";", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [OptionalSemiColonMapping(_0), input2]);
var KeywordString = (input) => If(Const("string", input), ([_0, input2]) => [KeywordStringMapping(_0), input2]);
var KeywordNumber = (input) => If(Const("number", input), ([_0, input2]) => [KeywordNumberMapping(_0), input2]);
var KeywordBoolean = (input) => If(Const("boolean", input), ([_0, input2]) => [KeywordBooleanMapping(_0), input2]);
var KeywordUndefined = (input) => If(Const("undefined", input), ([_0, input2]) => [KeywordUndefinedMapping(_0), input2]);
var KeywordNull = (input) => If(Const("null", input), ([_0, input2]) => [KeywordNullMapping(_0), input2]);
var KeywordInteger = (input) => If(Const("integer", input), ([_0, input2]) => [KeywordIntegerMapping(_0), input2]);
var KeywordBigInt = (input) => If(Const("bigint", input), ([_0, input2]) => [KeywordBigIntMapping(_0), input2]);
var KeywordUnknown = (input) => If(Const("unknown", input), ([_0, input2]) => [KeywordUnknownMapping(_0), input2]);
var KeywordAny = (input) => If(Const("any", input), ([_0, input2]) => [KeywordAnyMapping(_0), input2]);
var KeywordObject = (input) => If(Const("object", input), ([_0, input2]) => [KeywordObjectMapping(_0), input2]);
var KeywordNever = (input) => If(Const("never", input), ([_0, input2]) => [KeywordNeverMapping(_0), input2]);
var KeywordSymbol = (input) => If(Const("symbol", input), ([_0, input2]) => [KeywordSymbolMapping(_0), input2]);
var KeywordVoid = (input) => If(Const("void", input), ([_0, input2]) => [KeywordVoidMapping(_0), input2]);
var KeywordThis = (input) => If(Const("this", input), ([_0, input2]) => [KeywordThisMapping(_0), input2]);
var Keyword = (input) => If(If(KeywordString(input), ([_0, input2]) => [_0, input2], () => If(KeywordNumber(input), ([_0, input2]) => [_0, input2], () => If(KeywordBoolean(input), ([_0, input2]) => [_0, input2], () => If(KeywordUndefined(input), ([_0, input2]) => [_0, input2], () => If(KeywordNull(input), ([_0, input2]) => [_0, input2], () => If(KeywordInteger(input), ([_0, input2]) => [_0, input2], () => If(KeywordBigInt(input), ([_0, input2]) => [_0, input2], () => If(KeywordUnknown(input), ([_0, input2]) => [_0, input2], () => If(KeywordAny(input), ([_0, input2]) => [_0, input2], () => If(KeywordObject(input), ([_0, input2]) => [_0, input2], () => If(KeywordNever(input), ([_0, input2]) => [_0, input2], () => If(KeywordSymbol(input), ([_0, input2]) => [_0, input2], () => If(KeywordVoid(input), ([_0, input2]) => [_0, input2], () => If(KeywordThis(input), ([_0, input2]) => [_0, input2], () => [])))))))))))))), ([_0, input2]) => [KeywordMapping(_0), input2]);
var TemplateInterpolate = (input) => If(If(Const("${", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("}", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [TemplateInterpolateMapping(_0), input2]);
var TemplateSpan = (input) => If(Until(["${", "`"], input), ([_0, input2]) => [TemplateSpanMapping(_0), input2]);
var TemplateBody = (input) => If(If(If(TemplateSpan(input), ([_0, input2]) => If(TemplateInterpolate(input2), ([_1, input3]) => If(TemplateBody(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(TemplateSpan(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(TemplateSpan(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [TemplateBodyMapping(_0), input2]);
var TemplateLiteralTypes = (input) => If(If(Const("`", input), ([_0, input2]) => If(TemplateBody(input2), ([_1, input3]) => If(Const("`", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [TemplateLiteralTypesMapping(_0), input2]);
var TemplateLiteral = (input) => If(TemplateLiteralTypes(input), ([_0, input2]) => [TemplateLiteralMapping(_0), input2]);
var LiteralBigInt = (input) => If(BigInt3(input), ([_0, input2]) => [LiteralBigIntMapping(_0), input2]);
var LiteralBoolean = (input) => If(If(Const("true", input), ([_0, input2]) => [_0, input2], () => If(Const("false", input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [LiteralBooleanMapping(_0), input2]);
var LiteralNumber = (input) => If(Number3(input), ([_0, input2]) => [LiteralNumberMapping(_0), input2]);
var LiteralString = (input) => If(String3(["'", '"'], input), ([_0, input2]) => [LiteralStringMapping(_0), input2]);
var Literal2 = (input) => If(If(LiteralBigInt(input), ([_0, input2]) => [_0, input2], () => If(LiteralBoolean(input), ([_0, input2]) => [_0, input2], () => If(LiteralNumber(input), ([_0, input2]) => [_0, input2], () => If(LiteralString(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [LiteralMapping(_0), input2]);
var KeyOf = (input) => If(If(If(Const("keyof", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [KeyOfMapping(_0), input2]);
var IndexArray_0 = (input, result = []) => If(If(If(Const("[", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("]", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(Const("[", input), ([_0, input2]) => If(Const("]", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => IndexArray_0(input2, [...result, _0]), () => [result, input]);
var IndexArray = (input) => If(IndexArray_0(input), ([_0, input2]) => [IndexArrayMapping(_0), input2]);
var Extends = (input) => If(If(If(Const("extends", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("?", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => If(Const(":", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => [[_0, _1, _2, _3, _4, _5], input7])))))), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExtendsMapping(_0), input2]);
var Base2 = (input) => If(If(If(Const("(", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(Keyword(input), ([_0, input2]) => [_0, input2], () => If(_Object_2(input), ([_0, input2]) => [_0, input2], () => If(Tuple2(input), ([_0, input2]) => [_0, input2], () => If(TemplateLiteral(input), ([_0, input2]) => [_0, input2], () => If(Literal2(input), ([_0, input2]) => [_0, input2], () => If(Constructor2(input), ([_0, input2]) => [_0, input2], () => If(_Function_2(input), ([_0, input2]) => [_0, input2], () => If(Mapped(input), ([_0, input2]) => [_0, input2], () => If(Options(input), ([_0, input2]) => [_0, input2], () => If(GenericCall(input), ([_0, input2]) => [_0, input2], () => If(Reference(input), ([_0, input2]) => [_0, input2], () => [])))))))))))), ([_0, input2]) => [BaseMapping(_0), input2]);
var Factor = (input) => If(If(KeyOf(input), ([_0, input2]) => If(Base2(input2), ([_1, input3]) => If(IndexArray(input3), ([_2, input4]) => If(Extends(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [FactorMapping(_0), input2]);
var ExprTermTail = (input) => If(If(If(Const("&", input), ([_0, input2]) => If(Factor(input2), ([_1, input3]) => If(ExprTermTail(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExprTermTailMapping(_0), input2]);
var ExprTerm = (input) => If(If(Factor(input), ([_0, input2]) => If(ExprTermTail(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprTermMapping(_0), input2]);
var ExprTail = (input) => If(If(If(Const("|", input), ([_0, input2]) => If(ExprTerm(input2), ([_1, input3]) => If(ExprTail(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExprTailMapping(_0), input2]);
var Expr = (input) => If(If(ExprTerm(input), ([_0, input2]) => If(ExprTail(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprMapping(_0), input2]);
var ExprReadonly = (input) => If(If(Const("readonly", input), ([_0, input2]) => If(Expr(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprReadonlyMapping(_0), input2]);
var ExprPipe = (input) => If(If(Const("|", input), ([_0, input2]) => If(Expr(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprPipeMapping(_0), input2]);
var GenericType = (input) => If(If(GenericParameters(input), ([_0, input2]) => If(Const("=", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericTypeMapping(_0), input2]);
var InferType = (input) => If(If(If(Const("infer", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(Const("extends", input3), ([_2, input4]) => If(Expr(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => If(If(Const("infer", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [InferTypeMapping(_0), input2]);
var Type = (input) => If(If(InferType(input), ([_0, input2]) => [_0, input2], () => If(ExprPipe(input), ([_0, input2]) => [_0, input2], () => If(ExprReadonly(input), ([_0, input2]) => [_0, input2], () => If(Expr(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [TypeMapping(_0), input2]);
var PropertyKeyNumber = (input) => If(Number3(input), ([_0, input2]) => [PropertyKeyNumberMapping(_0), input2]);
var PropertyKeyIdent = (input) => If(Ident(input), ([_0, input2]) => [PropertyKeyIdentMapping(_0), input2]);
var PropertyKeyQuoted = (input) => If(String3(["'", '"'], input), ([_0, input2]) => [PropertyKeyQuotedMapping(_0), input2]);
var PropertyKeyIndex = (input) => If(If(Const("[", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(If(KeywordInteger(input4), ([_02, input5]) => [_02, input5], () => If(KeywordNumber(input4), ([_02, input5]) => [_02, input5], () => If(KeywordString(input4), ([_02, input5]) => [_02, input5], () => If(KeywordSymbol(input4), ([_02, input5]) => [_02, input5], () => [])))), ([_3, input5]) => If(Const("]", input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [PropertyKeyIndexMapping(_0), input2]);
var PropertyKey = (input) => If(If(PropertyKeyNumber(input), ([_0, input2]) => [_0, input2], () => If(PropertyKeyIdent(input), ([_0, input2]) => [_0, input2], () => If(PropertyKeyQuoted(input), ([_0, input2]) => [_0, input2], () => If(PropertyKeyIndex(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [PropertyKeyMapping(_0), input2]);
var Readonly2 = (input) => If(If(If(Const("readonly", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ReadonlyMapping(_0), input2]);
var Optional3 = (input) => If(If(If(Const("?", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [OptionalMapping(_0), input2]);
var Property = (input) => If(If(Readonly2(input), ([_0, input2]) => If(PropertyKey(input2), ([_1, input3]) => If(Optional3(input3), ([_2, input4]) => If(Const(":", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [PropertyMapping(_0), input2]);
var PropertyDelimiter = (input) => If(If(If(Const(",", input), ([_0, input2]) => If(Const("\n", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const(";", input), ([_0, input2]) => If(Const("\n", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const(",", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(Const(";", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(Const("\n", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => []))))), ([_0, input2]) => [PropertyDelimiterMapping(_0), input2]);
var PropertyList_0 = (input, result = []) => If(If(Property(input), ([_0, input2]) => If(PropertyDelimiter(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => PropertyList_0(input2, [...result, _0]), () => [result, input]);
var PropertyList = (input) => If(If(PropertyList_0(input), ([_0, input2]) => If(If(If(Property(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [PropertyListMapping(_0), input2]);
var Properties = (input) => If(If(Const("{", input), ([_0, input2]) => If(PropertyList(input2), ([_1, input3]) => If(Const("}", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PropertiesMapping(_0), input2]);
var _Object_2 = (input) => If(Properties(input), ([_0, input2]) => [_Object_Mapping(_0), input2]);
var ElementNamed = (input) => If(If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Const("readonly", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [_0, input2], () => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Const("readonly", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [ElementNamedMapping(_0), input2]);
var ElementReadonlyOptional = (input) => If(If(Const("readonly", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("?", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [ElementReadonlyOptionalMapping(_0), input2]);
var ElementReadonly = (input) => If(If(Const("readonly", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ElementReadonlyMapping(_0), input2]);
var ElementOptional = (input) => If(If(Type(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ElementOptionalMapping(_0), input2]);
var ElementBase = (input) => If(If(ElementNamed(input), ([_0, input2]) => [_0, input2], () => If(ElementReadonlyOptional(input), ([_0, input2]) => [_0, input2], () => If(ElementReadonly(input), ([_0, input2]) => [_0, input2], () => If(ElementOptional(input), ([_0, input2]) => [_0, input2], () => If(Type(input), ([_0, input2]) => [_0, input2], () => []))))), ([_0, input2]) => [ElementBaseMapping(_0), input2]);
var Element = (input) => If(If(If(Const("...", input), ([_0, input2]) => If(ElementBase(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(ElementBase(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ElementMapping(_0), input2]);
var ElementList_0 = (input, result = []) => If(If(Element(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => ElementList_0(input2, [...result, _0]), () => [result, input]);
var ElementList = (input) => If(If(ElementList_0(input), ([_0, input2]) => If(If(If(Element(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ElementListMapping(_0), input2]);
var Tuple2 = (input) => If(If(Const("[", input), ([_0, input2]) => If(ElementList(input2), ([_1, input3]) => If(Const("]", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [TupleMapping(_0), input2]);
var ParameterReadonlyOptional = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Const("readonly", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [ParameterReadonlyOptionalMapping(_0), input2]);
var ParameterReadonly = (input) => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Const("readonly", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [ParameterReadonlyMapping(_0), input2]);
var ParameterOptional = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [ParameterOptionalMapping(_0), input2]);
var ParameterType = (input) => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [ParameterTypeMapping(_0), input2]);
var ParameterBase = (input) => If(If(ParameterReadonlyOptional(input), ([_0, input2]) => [_0, input2], () => If(ParameterReadonly(input), ([_0, input2]) => [_0, input2], () => If(ParameterOptional(input), ([_0, input2]) => [_0, input2], () => If(ParameterType(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [ParameterBaseMapping(_0), input2]);
var Parameter2 = (input) => If(If(If(Const("...", input), ([_0, input2]) => If(ParameterBase(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(ParameterBase(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ParameterMapping(_0), input2]);
var ParameterList_0 = (input, result = []) => If(If(Parameter2(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => ParameterList_0(input2, [...result, _0]), () => [result, input]);
var ParameterList = (input) => If(If(ParameterList_0(input), ([_0, input2]) => If(If(If(Parameter2(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ParameterListMapping(_0), input2]);
var _Function_2 = (input) => If(If(Const("(", input), ([_0, input2]) => If(ParameterList(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => If(Const("=>", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [_Function_Mapping(_0), input2]);
var Constructor2 = (input) => If(If(Const("new", input), ([_0, input2]) => If(Const("(", input2), ([_1, input3]) => If(ParameterList(input3), ([_2, input4]) => If(Const(")", input4), ([_3, input5]) => If(Const("=>", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => [[_0, _1, _2, _3, _4, _5], input7])))))), ([_0, input2]) => [ConstructorMapping(_0), input2]);
var MappedReadonly = (input) => If(If(If(Const("+", input), ([_0, input2]) => If(Const("readonly", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("-", input), ([_0, input2]) => If(Const("readonly", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("readonly", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [MappedReadonlyMapping(_0), input2]);
var MappedOptional = (input) => If(If(If(Const("+", input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("-", input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("?", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [MappedOptionalMapping(_0), input2]);
var MappedAs = (input) => If(If(If(Const("as", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [MappedAsMapping(_0), input2]);
var Mapped = (input) => If(If(Const("{", input), ([_0, input2]) => If(MappedReadonly(input2), ([_1, input3]) => If(Const("[", input3), ([_2, input4]) => If(Ident(input4), ([_3, input5]) => If(Const("in", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => If(MappedAs(input7), ([_6, input8]) => If(Const("]", input8), ([_7, input9]) => If(MappedOptional(input9), ([_8, input10]) => If(Const(":", input10), ([_9, input11]) => If(Type(input11), ([_10, input12]) => If(OptionalSemiColon(input12), ([_11, input13]) => If(Const("}", input13), ([_12, input14]) => [[_0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12], input14]))))))))))))), ([_0, input2]) => [MappedMapping(_0), input2]);
var Reference = (input) => If(Ident(input), ([_0, input2]) => [ReferenceMapping(_0), input2]);
var Options = (input) => If(If(Const("Options", input), ([_0, input2]) => If(Const("<", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => If(Const(",", input4), ([_3, input5]) => If(JsonObject(input5), ([_4, input6]) => If(Const(">", input6), ([_5, input7]) => [[_0, _1, _2, _3, _4, _5], input7])))))), ([_0, input2]) => [OptionsMapping(_0), input2]);
var JsonNumber = (input) => If(Number3(input), ([_0, input2]) => [JsonNumberMapping(_0), input2]);
var JsonBoolean = (input) => If(If(Const("true", input), ([_0, input2]) => [_0, input2], () => If(Const("false", input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [JsonBooleanMapping(_0), input2]);
var JsonString = (input) => If(String3(['"', "'"], input), ([_0, input2]) => [JsonStringMapping(_0), input2]);
var JsonNull = (input) => If(Const("null", input), ([_0, input2]) => [JsonNullMapping(_0), input2]);
var JsonProperty = (input) => If(If(PropertyKey(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Json(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [JsonPropertyMapping(_0), input2]);
var JsonPropertyList_0 = (input, result = []) => If(If(JsonProperty(input), ([_0, input2]) => If(PropertyDelimiter(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => JsonPropertyList_0(input2, [...result, _0]), () => [result, input]);
var JsonPropertyList = (input) => If(If(JsonPropertyList_0(input), ([_0, input2]) => If(If(If(JsonProperty(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [JsonPropertyListMapping(_0), input2]);
var JsonObject = (input) => If(If(Const("{", input), ([_0, input2]) => If(JsonPropertyList(input2), ([_1, input3]) => If(Const("}", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [JsonObjectMapping(_0), input2]);
var JsonElementList_0 = (input, result = []) => If(If(Json(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => JsonElementList_0(input2, [...result, _0]), () => [result, input]);
var JsonElementList = (input) => If(If(JsonElementList_0(input), ([_0, input2]) => If(If(If(Json(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [JsonElementListMapping(_0), input2]);
var JsonArray = (input) => If(If(Const("[", input), ([_0, input2]) => If(JsonElementList(input2), ([_1, input3]) => If(Const("]", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [JsonArrayMapping(_0), input2]);
var Json = (input) => If(If(JsonNumber(input), ([_0, input2]) => [_0, input2], () => If(JsonBoolean(input), ([_0, input2]) => [_0, input2], () => If(JsonString(input), ([_0, input2]) => [_0, input2], () => If(JsonNull(input), ([_0, input2]) => [_0, input2], () => If(JsonObject(input), ([_0, input2]) => [_0, input2], () => If(JsonArray(input), ([_0, input2]) => [_0, input2], () => [])))))), ([_0, input2]) => [JsonMapping(_0), input2]);
var PatternBigInt = (input) => If(Const("-?(?:0|[1-9][0-9]*)n", input), ([_0, input2]) => [PatternBigIntMapping(_0), input2]);
var PatternString = (input) => If(Const(".*", input), ([_0, input2]) => [PatternStringMapping(_0), input2]);
var PatternNumber = (input) => If(Const("-?(?:0|[1-9][0-9]*)(?:.[0-9]+)?", input), ([_0, input2]) => [PatternNumberMapping(_0), input2]);
var PatternInteger = (input) => If(Const("-?(?:0|[1-9][0-9]*)", input), ([_0, input2]) => [PatternIntegerMapping(_0), input2]);
var PatternNever = (input) => If(Const("(?!)", input), ([_0, input2]) => [PatternNeverMapping(_0), input2]);
var PatternText = (input) => If(Until_1(["-?(?:0|[1-9][0-9]*)n", ".*", "-?(?:0|[1-9][0-9]*)(?:.[0-9]+)?", "-?(?:0|[1-9][0-9]*)", "(?!)", "(", ")", "$", "|"], input), ([_0, input2]) => [PatternTextMapping(_0), input2]);
var PatternBase = (input) => If(If(PatternBigInt(input), ([_0, input2]) => [_0, input2], () => If(PatternString(input), ([_0, input2]) => [_0, input2], () => If(PatternNumber(input), ([_0, input2]) => [_0, input2], () => If(PatternInteger(input), ([_0, input2]) => [_0, input2], () => If(PatternNever(input), ([_0, input2]) => [_0, input2], () => If(PatternGroup(input), ([_0, input2]) => [_0, input2], () => If(PatternText(input), ([_0, input2]) => [_0, input2], () => []))))))), ([_0, input2]) => [PatternBaseMapping(_0), input2]);
var PatternGroup = (input) => If(If(Const("(", input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PatternGroupMapping(_0), input2]);
var PatternUnion = (input) => If(If(If(PatternTerm(input), ([_0, input2]) => If(Const("|", input2), ([_1, input3]) => If(PatternUnion(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(PatternTerm(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [PatternUnionMapping(_0), input2]);
var PatternTerm = (input) => If(If(PatternBase(input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [PatternTermMapping(_0), input2]);
var PatternBody = (input) => If(If(PatternUnion(input), ([_0, input2]) => [_0, input2], () => If(PatternTerm(input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [PatternBodyMapping(_0), input2]);
var Pattern = (input) => If(If(Const("^", input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => If(Const("$", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PatternMapping(_0), input2]);
var InterfaceDeclarationHeritageList_0 = (input, result = []) => If(If(Type(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => InterfaceDeclarationHeritageList_0(input2, [...result, _0]), () => [result, input]);
var InterfaceDeclarationHeritageList = (input) => If(If(InterfaceDeclarationHeritageList_0(input), ([_0, input2]) => If(If(If(Type(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [InterfaceDeclarationHeritageListMapping(_0), input2]);
var InterfaceDeclarationHeritage = (input) => If(If(If(Const("extends", input), ([_0, input2]) => If(InterfaceDeclarationHeritageList(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [InterfaceDeclarationHeritageMapping(_0), input2]);
var InterfaceDeclarationGeneric = (input) => If(If(Const("interface", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(GenericParameters(input3), ([_2, input4]) => If(InterfaceDeclarationHeritage(input4), ([_3, input5]) => If(Properties(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [InterfaceDeclarationGenericMapping(_0), input2]);
var InterfaceDeclaration = (input) => If(If(Const("interface", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(InterfaceDeclarationHeritage(input3), ([_2, input4]) => If(Properties(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [InterfaceDeclarationMapping(_0), input2]);
var TypeAliasDeclarationGeneric = (input) => If(If(Const("type", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(GenericParameters(input3), ([_2, input4]) => If(Const("=", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [TypeAliasDeclarationGenericMapping(_0), input2]);
var TypeAliasDeclaration = (input) => If(If(Const("type", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(Const("=", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [TypeAliasDeclarationMapping(_0), input2]);
var ExportKeyword = (input) => If(If(If(Const("export", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExportKeywordMapping(_0), input2]);
var ModuleDeclarationDelimiter = (input) => If(If(If(Const(";", input), ([_0, input2]) => If(Const("\n", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const(";", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(Const("\n", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [ModuleDeclarationDelimiterMapping(_0), input2]);
var ModuleDeclarationList_0 = (input, result = []) => If(If(ModuleDeclaration(input), ([_0, input2]) => If(ModuleDeclarationDelimiter(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => ModuleDeclarationList_0(input2, [...result, _0]), () => [result, input]);
var ModuleDeclarationList = (input) => If(If(ModuleDeclarationList_0(input), ([_0, input2]) => If(If(If(ModuleDeclaration(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ModuleDeclarationListMapping(_0), input2]);
var ModuleDeclaration = (input) => If(If(ExportKeyword(input), ([_0, input2]) => If(If(InterfaceDeclarationGeneric(input2), ([_02, input3]) => [_02, input3], () => If(InterfaceDeclaration(input2), ([_02, input3]) => [_02, input3], () => If(TypeAliasDeclarationGeneric(input2), ([_02, input3]) => [_02, input3], () => If(TypeAliasDeclaration(input2), ([_02, input3]) => [_02, input3], () => [])))), ([_1, input3]) => If(OptionalSemiColon(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [ModuleDeclarationMapping(_0), input2]);
var Module = (input) => If(If(ModuleDeclaration(input), ([_0, input2]) => If(ModuleDeclarationList(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ModuleMapping(_0), input2]);
var Script = (input) => If(If(Module(input), ([_0, input2]) => [_0, input2], () => If(GenericType(input), ([_0, input2]) => [_0, input2], () => If(Type(input), ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [ScriptMapping(_0), input2]);

// ../../node_modules/typebox/build/type/engine/patterns/template.mjs
function ParseTemplateIntoTypes(template) {
  const parsed = TemplateLiteralTypes(`\`${template}\``);
  const result = guard_exports.IsEqual(parsed.length, 2) ? parsed[0] : Unreachable();
  return result;
}

// ../../node_modules/typebox/build/type/engine/template_literal/encode.mjs
function JoinString(input) {
  return input.join("|");
}
function UnwrapTemplateLiteralPattern(pattern) {
  return pattern.slice(1, pattern.length - 1);
}
function EncodeLiteral(value, right, pattern) {
  return EncodeTypes(right, `${pattern}${value}`);
}
function EncodeBigInt(right, pattern) {
  return EncodeTypes(right, `${pattern}${BigIntPattern}`);
}
function EncodeInteger(right, pattern) {
  return EncodeTypes(right, `${pattern}${IntegerPattern}`);
}
function EncodeNumber(right, pattern) {
  return EncodeTypes(right, `${pattern}${NumberPattern}`);
}
function EncodeBoolean(right, pattern) {
  return EncodeType(Union([Literal("false"), Literal("true")]), right, pattern);
}
function EncodeString(right, pattern) {
  return EncodeTypes(right, `${pattern}${StringPattern}`);
}
function EncodeTemplateLiteral(templatePattern, right, pattern) {
  return EncodeTypes(right, `${pattern}${UnwrapTemplateLiteralPattern(templatePattern)}`);
}
function EncodeTemplateLiteralDeferred(types, right, pattern) {
  const templateLiteral = TemplateLiteralAction(types, {});
  const result = EncodeType(templateLiteral, right, pattern);
  return result;
}
function EncodeEnum(types, right, pattern) {
  const variants = EnumValuesToVariants(types);
  return EncodeUnion(variants, right, pattern);
}
function EncodeUnion(types, right, pattern, result = []) {
  return guard_exports.TakeLeft(types, (head, tail) => EncodeUnion(tail, right, pattern, [...result, EncodeType(head, [], "")]), () => EncodeTypes(right, `${pattern}(${JoinString(result)})`));
}
function EncodeType(type, right, pattern) {
  return IsEnum(type) ? EncodeEnum(type.enum, right, pattern) : IsInteger2(type) ? EncodeInteger(right, pattern) : IsLiteral(type) ? EncodeLiteral(type.const, right, pattern) : IsBigInt2(type) ? EncodeBigInt(right, pattern) : IsBoolean2(type) ? EncodeBoolean(right, pattern) : IsNumber2(type) ? EncodeNumber(right, pattern) : IsString2(type) ? EncodeString(right, pattern) : IsTemplateLiteral(type) ? EncodeTemplateLiteral(type.pattern, right, pattern) : IsTemplateLiteralDeferred(type) ? EncodeTemplateLiteralDeferred(type.parameters[0], right, pattern) : IsUnion(type) ? EncodeUnion(type.anyOf, right, pattern) : NeverPattern;
}
function EncodeTypes(types, pattern) {
  return guard_exports.TakeLeft(types, (left, right) => EncodeType(left, right, pattern), () => pattern);
}
function EncodePattern(types) {
  const encoded = EncodeTypes(types, "");
  const result = `^${encoded}$`;
  return result;
}
function TemplateLiteralEncode(types) {
  const pattern = EncodePattern(types);
  const result = TemplateLiteralCreate(pattern);
  return result;
}

// ../../node_modules/typebox/build/type/engine/template_literal/instantiate.mjs
function TemplateLiteralAction(types, options) {
  const result = CanInstantiate(types) ? memory_exports.Update(TemplateLiteralEncode(types), {}, options) : TemplateLiteralDeferred(types, options);
  return result;
}
function TemplateLiteralInstantiate(context, state, types, options) {
  const instantiatedTypes = InstantiateTypes(context, state, types);
  return TemplateLiteralAction(instantiatedTypes, options);
}

// ../../node_modules/typebox/build/type/types/template_literal.mjs
function TemplateLiteralDeferred(types, options = {}) {
  return Deferred("TemplateLiteral", [types], options);
}
function IsTemplateLiteralDeferred(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "action") && guard_exports.IsEqual(value.action, "TemplateLiteral");
}
function TemplateLiteralFromTypes(types) {
  return TemplateLiteralAction(types, {});
}
function TemplateLiteralFromString(template) {
  const types = ParseTemplateIntoTypes(template);
  return TemplateLiteralFromTypes(types);
}
function TemplateLiteral2(input, options = {}) {
  const type = guard_exports.IsString(input) ? TemplateLiteralFromString(input) : TemplateLiteralFromTypes(input);
  return memory_exports.Update(type, {}, options);
}
function IsTemplateLiteral(value) {
  return IsKind(value, "TemplateLiteral");
}

// ../../node_modules/typebox/build/type/extends/result.mjs
var result_exports = {};
__export(result_exports, {
  ExtendsFalse: () => ExtendsFalse,
  ExtendsTrue: () => ExtendsTrue,
  ExtendsUnion: () => ExtendsUnion,
  IsExtendsFalse: () => IsExtendsFalse,
  IsExtendsTrue: () => IsExtendsTrue,
  IsExtendsTrueLike: () => IsExtendsTrueLike,
  IsExtendsUnion: () => IsExtendsUnion,
  Match: () => Match3
});
function ExtendsUnion(inferred) {
  return memory_exports.Create({ ["~kind"]: "ExtendsUnion" }, { inferred });
}
function IsExtendsUnion(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "inferred") && guard_exports.IsEqual(value["~kind"], "ExtendsUnion") && guard_exports.IsObject(value.inferred);
}
function ExtendsTrue(inferred) {
  return memory_exports.Create({ ["~kind"]: "ExtendsTrue" }, { inferred });
}
function IsExtendsTrue(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "inferred") && guard_exports.IsEqual(value["~kind"], "ExtendsTrue") && guard_exports.IsObject(value.inferred);
}
function ExtendsFalse() {
  return memory_exports.Create({ ["~kind"]: "ExtendsFalse" }, {});
}
function IsExtendsFalse(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.IsEqual(value["~kind"], "ExtendsFalse");
}
function IsExtendsTrueLike(value) {
  return IsExtendsUnion(value) || IsExtendsTrue(value);
}
function Match3(result, true_, false_) {
  return IsExtendsTrueLike(result) ? true_(result.inferred) : false_();
}

// ../../node_modules/typebox/build/type/extends/extends_right.mjs
function ExtendsRightInfer(inferred, name, left, right) {
  return Match3(ExtendsLeft(inferred, left, right), (checkInferred) => ExtendsTrue(memory_exports.Assign(memory_exports.Assign(inferred, checkInferred), { [name]: left })), () => ExtendsFalse());
}
function ExtendsRightAny(inferred, _left) {
  return ExtendsTrue(inferred);
}
function ExtendsRightEnum(inferred, left, right) {
  const union = EnumValuesToUnion(right);
  return ExtendsLeft(inferred, left, union);
}
function ExtendsRightIntersect(inferred, left, right) {
  return guard_exports.TakeLeft(right, (head, tail) => Match3(ExtendsLeft(inferred, left, head), (inferred2) => ExtendsRightIntersect(inferred2, left, tail), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsRightTemplateLiteral(inferred, left, right) {
  const decoded = TemplateLiteralDecode(right);
  return ExtendsLeft(inferred, left, decoded);
}
function ExtendsRightUnion(inferred, left, right) {
  return guard_exports.TakeLeft(right, (head, tail) => Match3(ExtendsLeft(inferred, left, head), (inferred2) => ExtendsTrue(inferred2), () => ExtendsRightUnion(inferred, left, tail)), () => ExtendsFalse());
}
function ExtendsRight(inferred, left, right) {
  return IsAny(right) ? ExtendsRightAny(inferred, left) : IsEnum(right) ? ExtendsRightEnum(inferred, left, right.enum) : IsInfer(right) ? ExtendsRightInfer(inferred, right.name, left, right.extends) : IsIntersect(right) ? ExtendsRightIntersect(inferred, left, right.allOf) : IsTemplateLiteral(right) ? ExtendsRightTemplateLiteral(inferred, left, right.pattern) : IsUnion(right) ? ExtendsRightUnion(inferred, left, right.anyOf) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/any.mjs
function ExtendsAny(inferred, left, right) {
  return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsUnion(inferred);
}

// ../../node_modules/typebox/build/type/extends/array.mjs
function ExtendsImmutable(left, right) {
  const isImmutableLeft = IsImmutable(left);
  const isImmutableRight = IsImmutable(right);
  return isImmutableLeft && isImmutableRight ? true : !isImmutableLeft && isImmutableRight ? true : isImmutableLeft && !isImmutableRight ? false : true;
}
function ExtendsArray(inferred, arrayLeft, left, right) {
  return IsArray2(right) ? ExtendsImmutable(arrayLeft, right) ? ExtendsLeft(inferred, left, right.items) : ExtendsFalse() : ExtendsRight(inferred, arrayLeft, right);
}

// ../../node_modules/typebox/build/type/extends/async_iterator.mjs
function ExtendsAsyncIterator(inferred, left, right) {
  return IsAsyncIterator2(right) ? ExtendsLeft(inferred, left, right.iteratorItems) : ExtendsRight(inferred, AsyncIterator(left), right);
}

// ../../node_modules/typebox/build/type/extends/bigint.mjs
function ExtendsBigInt(inferred, left, right) {
  return IsBigInt2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/boolean.mjs
function ExtendsBoolean(inferred, left, right) {
  return IsBoolean2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/parameters.mjs
function ParameterCompare(inferred, left, leftRest, right, rightRest) {
  const checkLeft = IsInfer(right) ? left : right;
  const checkRight = IsInfer(right) ? right : left;
  const isLeftOptional = IsOptional(left);
  const isRightOptional = IsOptional(right);
  return !isLeftOptional && isRightOptional ? ExtendsFalse() : Match3(ExtendsLeft(inferred, checkLeft, checkRight), (inferred2) => ExtendsParameters(inferred2, leftRest, rightRest), () => ExtendsFalse());
}
function ParameterRight(inferred, left, leftRest, rightRest) {
  return guard_exports.TakeLeft(rightRest, (head, tail) => ParameterCompare(inferred, left, leftRest, head, tail), () => IsOptional(left) ? ExtendsTrue(inferred) : ExtendsFalse());
}
function ParametersLeft(inferred, left, rightRest) {
  return guard_exports.TakeLeft(left, (head, tail) => ParameterRight(inferred, head, tail, rightRest), () => ExtendsTrue(inferred));
}
function ExtendsParameters(inferred, left, right) {
  return ParametersLeft(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/return_type.mjs
function ExtendsReturnType(inferred, left, right) {
  return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsLeft(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/constructor.mjs
function ExtendsConstructor(inferred, parameters, returnType, right) {
  return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsConstructor2(right) ? Match3(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred2) => ExtendsReturnType(inferred2, returnType, right["instanceType"]), () => ExtendsFalse()) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/enum.mjs
function ExtendsEnum(inferred, left, right) {
  return ExtendsLeft(inferred, EnumToUnion(left), right);
}

// ../../node_modules/typebox/build/type/extends/function.mjs
function ExtendsFunction(inferred, parameters, returnType, right) {
  return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsFunction2(right) ? Match3(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred2) => ExtendsReturnType(inferred2, returnType, right["returnType"]), () => ExtendsFalse()) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/integer.mjs
function ExtendsInteger(inferred, left, right) {
  return IsInteger2(right) ? ExtendsTrue(inferred) : IsNumber2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/intersect.mjs
function ExtendsIntersect(inferred, left, right) {
  const evaluated = EvaluateIntersect(left);
  return ExtendsLeft(inferred, evaluated, right);
}

// ../../node_modules/typebox/build/type/extends/iterator.mjs
function ExtendsIterator(inferred, left, right) {
  return IsIterator2(right) ? ExtendsLeft(inferred, left, right.iteratorItems) : ExtendsRight(inferred, Iterator(left), right);
}

// ../../node_modules/typebox/build/type/extends/literal.mjs
function ExtendsLiteralValue(inferred, left, right) {
  return left === right ? ExtendsTrue(inferred) : ExtendsFalse();
}
function ExtendsLiteralBigInt(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBigInt2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralBoolean(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBoolean2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralNumber(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsNumber2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralString(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsString2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteral(inferred, left, right) {
  return guard_exports.IsBigInt(left.const) ? ExtendsLiteralBigInt(inferred, left.const, right) : guard_exports.IsBoolean(left.const) ? ExtendsLiteralBoolean(inferred, left.const, right) : guard_exports.IsNumber(left.const) ? ExtendsLiteralNumber(inferred, left.const, right) : guard_exports.IsString(left.const) ? ExtendsLiteralString(inferred, left.const, right) : Unreachable();
}

// ../../node_modules/typebox/build/type/extends/never.mjs
function ExtendsNever(inferred, left, right) {
  return IsInfer(right) ? ExtendsRight(inferred, left, right) : ExtendsTrue(inferred);
}

// ../../node_modules/typebox/build/type/extends/null.mjs
function ExtendsNull(inferred, left, right) {
  return IsNull2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/number.mjs
function ExtendsNumber(inferred, left, right) {
  return IsNumber2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/object.mjs
function ExtendsPropertyOptional(inferred, left, right) {
  return IsOptional(left) ? IsOptional(right) ? ExtendsTrue(inferred) : ExtendsFalse() : ExtendsTrue(inferred);
}
function ExtendsProperty(inferred, left, right) {
  return (
    // Right TInfer<TNever> is TExtendsFalse
    IsInfer(right) && IsNever(right.extends) ? ExtendsFalse() : Match3(ExtendsLeft(inferred, left, right), (inferred2) => ExtendsPropertyOptional(inferred2, left, right), () => ExtendsFalse())
  );
}
function ExtractInferredProperties(keys, properties) {
  return keys.reduce((result, key) => {
    return key in properties ? IsExtendsTrueLike(properties[key]) ? { ...result, ...properties[key].inferred } : Unreachable() : Unreachable();
  }, {});
}
function ExtendsPropertiesComparer(inferred, left, right) {
  const properties = {};
  for (const rightKey of guard_exports.Keys(right)) {
    properties[rightKey] = rightKey in left ? ExtendsProperty({}, left[rightKey], right[rightKey]) : IsOptional(right[rightKey]) ? IsInfer(right[rightKey]) ? ExtendsTrue(memory_exports.Assign(inferred, { [right[rightKey].name]: right[rightKey].extends })) : ExtendsTrue(inferred) : ExtendsFalse();
  }
  const checked = guard_exports.Values(properties).every((result) => IsExtendsTrueLike(result));
  const extracted = checked ? ExtractInferredProperties(guard_exports.Keys(properties), properties) : {};
  return checked ? ExtendsTrue(extracted) : ExtendsFalse();
}
function ExtendsProperties(inferred, left, right) {
  const compared = ExtendsPropertiesComparer(inferred, left, right);
  return IsExtendsTrueLike(compared) ? ExtendsTrue(memory_exports.Assign(inferred, compared.inferred)) : ExtendsFalse();
}
function ExtendsObjectToObject(inferred, left, right) {
  return ExtendsProperties(inferred, left, right);
}
function ExtendsObject(inferred, left, right) {
  return IsObject2(right) ? ExtendsObjectToObject(inferred, left, right.properties) : ExtendsRight(inferred, _Object_(left), right);
}

// ../../node_modules/typebox/build/type/extends/promise.mjs
function ExtendsPromise(inferred, left, right) {
  return IsPromise(right) ? ExtendsLeft(inferred, left, right.item) : ExtendsRight(inferred, _Promise_(left), right);
}

// ../../node_modules/typebox/build/type/extends/string.mjs
function ExtendsString(inferred, left, right) {
  return IsString2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/symbol.mjs
function ExtendsSymbol(inferred, left, right) {
  return IsSymbol2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/template_literal.mjs
function ExtendsTemplateLiteral(inferred, left, right) {
  const decoded = TemplateLiteralDecode(left);
  return ExtendsLeft(inferred, decoded, right);
}

// ../../node_modules/typebox/build/type/extends/inference.mjs
function Inferrable(name, type) {
  return memory_exports.Create({ "~kind": "Inferrable" }, { name, type }, {});
}
function IsInferable(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "name") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "Inferrable") && guard_exports.IsString(value.name) && guard_exports.IsObject(value.type);
}
function TryRestInferable(type) {
  return IsRest(type) ? IsInfer(type.items) ? IsArray2(type.items.extends) ? Inferrable(type.items.name, type.items.extends.items) : IsUnknown(type.items.extends) ? Inferrable(type.items.name, type.items.extends) : void 0 : Unreachable() : void 0;
}
function TryInferable(type) {
  return IsInfer(type) ? Inferrable(type.name, type.extends) : void 0;
}
function TryInferResults(rest, right, result = []) {
  return guard_exports.TakeLeft(rest, (head, tail) => Match3(ExtendsLeft({}, head, right), () => TryInferResults(tail, right, [...result, head]), () => void 0), () => result);
}
function InferTupleResult(inferred, name, left, right) {
  const results = TryInferResults(left, right);
  return guard_exports.IsArray(results) ? ExtendsTrue(memory_exports.Assign(inferred, { [name]: Tuple(results) })) : ExtendsFalse();
}
function InferUnionResult(inferred, name, left, right) {
  const results = TryInferResults(left, right);
  return guard_exports.IsArray(results) ? ExtendsTrue(memory_exports.Assign(inferred, { [name]: Union(results) })) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/tuple.mjs
function Reverse(types) {
  return [...types].reverse();
}
function ApplyReverse(types, reversed) {
  return reversed ? Reverse(types) : types;
}
function Reversed(types) {
  const first = types.length > 0 ? types[0] : void 0;
  const inferrable = IsSchema(first) ? TryRestInferable(first) : void 0;
  return IsSchema(inferrable);
}
function ElementsCompare(inferred, reversed, left, leftRest, right, rightRest) {
  return Match3(ExtendsLeft(inferred, left, right), (checkInferred) => Elements(checkInferred, reversed, leftRest, rightRest), () => ExtendsFalse());
}
function ElementsLeft(inferred, reversed, leftRest, right, rightRest) {
  const inferable = TryRestInferable(right);
  return (
    // Rest Inferrable Right Means we delegate to TInferTupleResult to Generate a Result
    IsInferable(inferable) ? InferTupleResult(inferred, inferable["name"], ApplyReverse(leftRest, reversed), inferable["type"]) : guard_exports.TakeLeft(leftRest, (head, tail) => ElementsCompare(inferred, reversed, head, tail, right, rightRest), () => ExtendsFalse())
  );
}
function ElementsRight(inferred, reversed, leftRest, rightRest) {
  return guard_exports.TakeLeft(rightRest, (head, tail) => ElementsLeft(inferred, reversed, leftRest, head, tail), () => guard_exports.IsEqual(leftRest.length, 0) ? ExtendsTrue(inferred) : ExtendsFalse());
}
function Elements(inferred, reversed, leftRest, rightRest) {
  return ElementsRight(inferred, reversed, leftRest, rightRest);
}
function ExtendsTupleToTuple(inferred, left, right) {
  const instantiatedRight = InstantiateElements(inferred, { callstack: [] }, right);
  const reversed = Reversed(instantiatedRight);
  return Elements(inferred, reversed, ApplyReverse(left, reversed), ApplyReverse(instantiatedRight, reversed));
}
function ExtendsTupleToArray(inferred, left, right) {
  const inferrable = TryInferable(right);
  return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable["name"], left, inferrable["type"]) : guard_exports.TakeLeft(left, (head, tail) => Match3(ExtendsLeft(inferred, head, right), (inferred2) => ExtendsTupleToArray(inferred2, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsTuple(inferred, left, right) {
  const instantiatedLeft = InstantiateElements(inferred, { callstack: [] }, left);
  return IsTuple(right) ? ExtendsTupleToTuple(inferred, instantiatedLeft, right.items) : IsArray2(right) ? ExtendsTupleToArray(inferred, instantiatedLeft, right.items) : ExtendsRight(inferred, Tuple(instantiatedLeft), right);
}

// ../../node_modules/typebox/build/type/extends/undefined.mjs
function ExtendsUndefined(inferred, left, right) {
  return IsVoid(right) ? ExtendsTrue(inferred) : IsUndefined2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/union.mjs
function ExtendsUnionSome(inferred, type, unionTypes) {
  return guard_exports.TakeLeft(unionTypes, (head, tail) => Match3(ExtendsLeft(inferred, type, head), (inferred2) => ExtendsTrue(inferred2), () => ExtendsUnionSome(inferred, type, tail)), () => ExtendsFalse());
}
function ExtendsUnionLeft(inferred, left, right) {
  return guard_exports.TakeLeft(left, (head, tail) => Match3(ExtendsUnionSome(inferred, head, right), (inferred2) => ExtendsUnionLeft(inferred2, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsUnion2(inferred, left, right) {
  const inferrable = TryInferable(right);
  return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable.name, left, inferrable.type) : IsUnion(right) ? ExtendsUnionLeft(inferred, left, right.anyOf) : ExtendsUnionLeft(inferred, left, [right]);
}

// ../../node_modules/typebox/build/type/extends/unknown.mjs
function ExtendsUnknown(inferred, left, right) {
  return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/void.mjs
function ExtendsVoid(inferred, left, right) {
  return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/extends_left.mjs
function ExtendsLeft(inferred, left, right) {
  return IsAny(left) ? ExtendsAny(inferred, left, right) : IsArray2(left) ? ExtendsArray(inferred, left, left.items, right) : IsAsyncIterator2(left) ? ExtendsAsyncIterator(inferred, left.iteratorItems, right) : IsBigInt2(left) ? ExtendsBigInt(inferred, left, right) : IsBoolean2(left) ? ExtendsBoolean(inferred, left, right) : IsConstructor2(left) ? ExtendsConstructor(inferred, left.parameters, left.instanceType, right) : IsEnum(left) ? ExtendsEnum(inferred, left, right) : IsFunction2(left) ? ExtendsFunction(inferred, left.parameters, left.returnType, right) : IsInteger2(left) ? ExtendsInteger(inferred, left, right) : IsIntersect(left) ? ExtendsIntersect(inferred, left.allOf, right) : IsIterator2(left) ? ExtendsIterator(inferred, left.iteratorItems, right) : IsLiteral(left) ? ExtendsLiteral(inferred, left, right) : IsNever(left) ? ExtendsNever(inferred, left, right) : IsNull2(left) ? ExtendsNull(inferred, left, right) : IsNumber2(left) ? ExtendsNumber(inferred, left, right) : IsObject2(left) ? ExtendsObject(inferred, left.properties, right) : IsPromise(left) ? ExtendsPromise(inferred, left.item, right) : IsString2(left) ? ExtendsString(inferred, left, right) : IsSymbol2(left) ? ExtendsSymbol(inferred, left, right) : IsTemplateLiteral(left) ? ExtendsTemplateLiteral(inferred, left.pattern, right) : IsTuple(left) ? ExtendsTuple(inferred, left.items, right) : IsUndefined2(left) ? ExtendsUndefined(inferred, left, right) : IsUnion(left) ? ExtendsUnion2(inferred, left.anyOf, right) : IsUnknown(left) ? ExtendsUnknown(inferred, left, right) : IsVoid(left) ? ExtendsVoid(inferred, left, right) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/engine/interface/instantiate.mjs
function InterfaceOperation(heritage, properties) {
  const result = EvaluateIntersect([...heritage, _Object_(properties)]);
  return result;
}
function InterfaceAction(heritage, properties, options) {
  const result = CanInstantiate(heritage) ? memory_exports.Update(InterfaceOperation(heritage, properties), {}, options) : InterfaceDeferred(heritage, properties, options);
  return result;
}
function InterfaceInstantiate(context, state, heritage, properties, options) {
  const instantiatedHeritage = InstantiateTypes(context, state, heritage);
  const instantiatedProperties = InstantiateProperties(context, state, properties);
  return InterfaceAction(instantiatedHeritage, instantiatedProperties, options);
}

// ../../node_modules/typebox/build/type/action/interface.mjs
function InterfaceDeferred(heritage, properties, options = {}) {
  return Deferred("Interface", [heritage, properties], options);
}
function IsInterfaceDeferred(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "action") && guard_exports.IsEqual(value.action, "Interface");
}
function Interface(heritage, properties, options = {}) {
  return InterfaceAction(heritage, properties, options);
}

// ../../node_modules/typebox/build/type/engine/cyclic/check.mjs
function FromRef(stack, context, ref) {
  return stack.includes(ref) ? true : FromType3([...stack, ref], context, context[ref]);
}
function FromProperties(stack, context, properties) {
  const types = PropertyValues(properties);
  return FromTypes2(stack, context, types);
}
function FromTypes2(stack, context, types) {
  return guard_exports.TakeLeft(types, (left, right) => FromType3(stack, context, left) ? true : FromTypes2(stack, context, right), () => false);
}
function FromType3(stack, context, type) {
  return IsRef(type) ? FromRef(stack, context, type.$ref) : IsArray2(type) ? FromType3(stack, context, type.items) : IsAsyncIterator2(type) ? FromType3(stack, context, type.iteratorItems) : IsConstructor2(type) ? FromTypes2(stack, context, [...type.parameters, type.instanceType]) : IsFunction2(type) ? FromTypes2(stack, context, [...type.parameters, type.returnType]) : IsInterfaceDeferred(type) ? FromProperties(stack, context, type.parameters[1]) : IsIntersect(type) ? FromTypes2(stack, context, type.allOf) : IsIterator2(type) ? FromType3(stack, context, type.iteratorItems) : IsObject2(type) ? FromProperties(stack, context, type.properties) : IsPromise(type) ? FromType3(stack, context, type.item) : IsUnion(type) ? FromTypes2(stack, context, type.anyOf) : IsTuple(type) ? FromTypes2(stack, context, type.items) : IsRecord(type) ? FromType3(stack, context, RecordValue(type)) : false;
}
function CyclicCheck(stack, context, type) {
  const result = FromType3(stack, context, type);
  return result;
}

// ../../node_modules/typebox/build/type/engine/cyclic/candidates.mjs
function ResolveCandidateKeys(context, keys) {
  return keys.reduce((result, left) => {
    return left in context ? CyclicCheck([left], context, context[left]) ? [...result, left] : result : Unreachable();
  }, []);
}
function CyclicCandidates(context) {
  const keys = PropertyKeys(context);
  const result = ResolveCandidateKeys(context, keys);
  return result;
}

// ../../node_modules/typebox/build/type/engine/cyclic/dependencies.mjs
function FromRef2(context, ref, result) {
  return result.includes(ref) ? result : ref in context ? FromType4(context, context[ref], [...result, ref]) : Unreachable();
}
function FromProperties2(context, properties, result) {
  const types = PropertyValues(properties);
  return FromTypes3(context, types, result);
}
function FromTypes3(context, types, result) {
  return types.reduce((result2, left) => {
    return FromType4(context, left, result2);
  }, result);
}
function FromType4(context, type, result) {
  return IsRef(type) ? FromRef2(context, type.$ref, result) : IsArray2(type) ? FromType4(context, type.items, result) : IsAsyncIterator2(type) ? FromType4(context, type.iteratorItems, result) : IsConstructor2(type) ? FromTypes3(context, [...type.parameters, type.instanceType], result) : IsFunction2(type) ? FromTypes3(context, [...type.parameters, type.returnType], result) : IsInterfaceDeferred(type) ? FromProperties2(context, type.parameters[1], result) : IsIntersect(type) ? FromTypes3(context, type.allOf, result) : IsIterator2(type) ? FromType4(context, type.iteratorItems, result) : IsObject2(type) ? FromProperties2(context, type.properties, result) : IsPromise(type) ? FromType4(context, type.item, result) : IsUnion(type) ? FromTypes3(context, type.anyOf, result) : IsTuple(type) ? FromTypes3(context, type.items, result) : IsRecord(type) ? FromType4(context, RecordValue(type), result) : result;
}
function CyclicDependencies(context, key, type) {
  const result = FromType4(context, type, [key]);
  return result;
}

// ../../node_modules/typebox/build/type/engine/cyclic/extends.mjs
function FromRef3(_ref) {
  return Any();
}
function FromProperties3(properties) {
  return guard_exports.Keys(properties).reduce((result, key) => {
    return { ...result, [key]: FromType5(properties[key]) };
  }, {});
}
function FromTypes4(types) {
  return types.reduce((result, left) => {
    return [...result, FromType5(left)];
  }, []);
}
function FromType5(type) {
  return IsRef(type) ? FromRef3(type.$ref) : IsArray2(type) ? _Array_(FromType5(type.items), ArrayOptions(type)) : IsAsyncIterator2(type) ? AsyncIterator(FromType5(type.iteratorItems)) : IsConstructor2(type) ? Constructor(FromTypes4(type.parameters), FromType5(type.instanceType)) : IsFunction2(type) ? _Function_(FromTypes4(type.parameters), FromType5(type.returnType)) : IsIntersect(type) ? Intersect(FromTypes4(type.allOf)) : IsIterator2(type) ? Iterator(FromType5(type.iteratorItems)) : IsObject2(type) ? _Object_(FromProperties3(type.properties)) : IsPromise(type) ? _Promise_(FromType5(type.item)) : IsRecord(type) ? Record(RecordKey(type), FromType5(RecordValue(type))) : IsUnion(type) ? Union(FromTypes4(type.anyOf)) : IsTuple(type) ? Tuple(FromTypes4(type.items)) : type;
}
function CyclicAnyFromParameters(defs, ref) {
  return ref in defs ? FromType5(defs[ref]) : Unknown();
}
function CyclicExtends(type) {
  return CyclicAnyFromParameters(type.$defs, type.$ref);
}

// ../../node_modules/typebox/build/type/engine/cyclic/instantiate.mjs
function CyclicInterface(context, heritage, properties) {
  const instantiatedHeritage = InstantiateTypes(context, { callstack: [] }, heritage);
  const instantiatedProperties = InstantiateProperties({}, { callstack: [] }, properties);
  const evaluatedInterface = EvaluateIntersect([...instantiatedHeritage, _Object_(instantiatedProperties)]);
  return evaluatedInterface;
}
function CyclicDefinitions(context, dependencies) {
  const keys = guard_exports.Keys(context).filter((key) => dependencies.includes(key));
  return keys.reduce((result, key) => {
    const type = context[key];
    const instantiatedType = IsInterfaceDeferred(type) ? CyclicInterface(context, type.parameters[0], type.parameters[1]) : type;
    return { ...result, [key]: instantiatedType };
  }, {});
}
function InstantiateCyclic(context, ref, type) {
  const dependencies = CyclicDependencies(context, ref, type);
  const definitions = CyclicDefinitions(context, dependencies);
  const result = Cyclic(definitions, ref);
  return result;
}

// ../../node_modules/typebox/build/type/engine/cyclic/target.mjs
function Resolve(defs, ref) {
  return ref in defs ? IsRef(defs[ref]) ? Resolve(defs, defs[ref].$ref) : defs[ref] : Never();
}
function CyclicTarget(defs, ref) {
  const result = Resolve(defs, ref);
  return result;
}

// ../../node_modules/typebox/build/type/extends/extends.mjs
function Canonical(type) {
  return IsCyclic(type) ? CyclicExtends(type) : IsUnsafe(type) ? Unknown() : type;
}
function Extends2(inferred, left, right) {
  const canonicalLeft = Canonical(left);
  const canonicalRight = Canonical(right);
  return ExtendsLeft(inferred, canonicalLeft, canonicalRight);
}

// ../../node_modules/typebox/build/type/engine/evaluate/compare.mjs
var ResultEqual = "equal";
var ResultDisjoint = "disjoint";
var ResultLeftInside = "left-inside";
var ResultRightInside = "right-inside";
function Compare(left, right) {
  const extendsCheck = [
    IsUnknown(left) ? result_exports.ExtendsFalse() : Extends2({}, left, right),
    IsUnknown(left) ? result_exports.ExtendsTrue({}) : Extends2({}, right, left)
  ];
  return result_exports.IsExtendsTrueLike(extendsCheck[0]) && result_exports.IsExtendsTrueLike(extendsCheck[1]) ? ResultEqual : result_exports.IsExtendsTrueLike(extendsCheck[0]) && result_exports.IsExtendsFalse(extendsCheck[1]) ? ResultLeftInside : result_exports.IsExtendsFalse(extendsCheck[0]) && result_exports.IsExtendsTrueLike(extendsCheck[1]) ? ResultRightInside : ResultDisjoint;
}

// ../../node_modules/typebox/build/type/engine/evaluate/broaden.mjs
function BroadFilter(type, types) {
  return types.filter((left) => {
    return Compare(type, left) === ResultRightInside ? false : true;
  });
}
function IsBroadestType(type, types) {
  const result = types.some((left) => {
    const result2 = Compare(type, left);
    return guard_exports.IsEqual(result2, ResultLeftInside) || guard_exports.IsEqual(result2, ResultEqual);
  });
  return guard_exports.IsEqual(result, false);
}
function BroadenType(type, types) {
  const evaluated = EvaluateType(type);
  return IsAny(evaluated) ? [evaluated] : IsBroadestType(evaluated, types) ? [...BroadFilter(evaluated, types), evaluated] : types;
}
function BroadenTypes(types) {
  return types.reduce((result, left) => {
    return IsObject2(left) ? [...result, left] : (
      // push
      IsNever(left) ? result : (
        // ignore
        BroadenType(left, result)
      )
    );
  }, []);
}
function Broaden(types) {
  const broadened = BroadenTypes(types);
  const flattened = Flatten(broadened);
  const result = flattened.length === 0 ? Never() : flattened.length === 1 ? flattened[0] : Union(flattened);
  return result;
}

// ../../node_modules/typebox/build/type/engine/evaluate/instantiate.mjs
function EvaluateAction(type, options) {
  const result = memory_exports.Update(EvaluateType(type), {}, options);
  return result;
}
function EvaluateInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return EvaluateAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/engine/call/distribute_arguments.mjs
function CollectDistributionNames(expression, result = []) {
  return (
    // Conditional
    IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Conditional") ? IsRef(expression.parameters[0]) ? CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], [...result, expression.parameters[0]["$ref"]])) : CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], result)) : IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Mapped") ? IsDeferred(expression.parameters[1]) && guard_exports.IsEqual(expression.parameters[1].action, "KeyOf") && IsRef(expression.parameters[1].parameters[0]) ? [...result, expression.parameters[1].parameters[0]["$ref"]] : result : result
  );
}
function BuildDistributionArray(parameters, names) {
  return parameters.reduce((result, left) => [...result, names.includes(left.name)], []);
}
function ZipDistributionArray(arguments_, distributionArray, result = []) {
  return guard_exports.TakeLeft(arguments_, (argumentLeft, argumentRight) => guard_exports.TakeLeft(distributionArray, (booleanLeft, booleanRight) => ZipDistributionArray(argumentRight, booleanRight, [...result, [booleanLeft, argumentLeft]]), () => result), () => result);
}
function Expand(type) {
  return IsUnion(type) ? [...type.anyOf] : [type];
}
function Append(current, type) {
  return current.reduce((result, left) => [...result, [...left, type]], []);
}
function Cross(current, variants) {
  return variants.reduce((result, left) => {
    return [...result, ...Append(current, left)];
  }, []);
}
function Distribute2(zipped) {
  return zipped.reduce((result, left) => {
    return guard_exports.IsEqual(left[0], true) ? Cross(result, Expand(left[1])) : Cross(result, [left[1]]);
  }, [[]]);
}
function DistributeArguments(parameters, arguments_, expression) {
  const distributionNames = CollectDistributionNames(expression);
  const distributionArray = BuildDistributionArray(parameters, distributionNames);
  const zippedArguments = ZipDistributionArray(arguments_, distributionArray);
  return IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Conditional") ? Distribute2(zippedArguments) : IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Mapped") ? Distribute2(zippedArguments) : [arguments_];
}

// ../../node_modules/typebox/build/type/engine/call/resolve_target.mjs
function FromNotResolvable() {
  return ["(not-resolvable)", Never()];
}
function FromNotGeneric() {
  return ["(not-generic)", Never()];
}
function FromGeneric(name, parameters, expression) {
  return [name, Generic(parameters, expression)];
}
function FromRef4(context, ref, arguments_) {
  return ref in context ? FromType6(context, ref, context[ref], arguments_) : FromNotResolvable();
}
function FromType6(context, name, target, arguments_) {
  return IsGeneric(target) ? FromGeneric(name, target.parameters, target.expression) : IsRef(target) ? FromRef4(context, target.$ref, arguments_) : FromNotGeneric();
}
function ResolveTarget(context, target, arguments_) {
  return FromType6(context, "(anonymous)", target, arguments_);
}

// ../../node_modules/typebox/build/type/engine/call/resolve_arguments.mjs
function AssertArgumentExtends(name, type, extends_) {
  if (IsInfer(type) || IsCall(type) || result_exports.IsExtendsTrueLike(Extends2({}, type, extends_)))
    return;
  const cause = { parameter: name, expect: extends_, actual: type };
  throw new Error(`Argument for parameter ${name} does not satisfy constraint`, { cause });
}
function BindArgument(context, state, name, extends_, type) {
  const instantiatedArgument = InstantiateType(context, state, type);
  AssertArgumentExtends(name, instantiatedArgument, extends_);
  return memory_exports.Assign(context, { [name]: instantiatedArgument });
}
function BindArguments(context, state, parameterLeft, parameterRight, arguments_) {
  const instantiatedExtends = InstantiateType(context, state, parameterLeft.extends);
  const instantiatedEquals = InstantiateType(context, state, parameterLeft.equals);
  return guard_exports.TakeLeft(arguments_, (left, right) => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, left), state, parameterRight, right), () => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, instantiatedEquals), state, parameterRight, []));
}
function BindParameters(context, state, parameters, arguments_) {
  return guard_exports.TakeLeft(parameters, (left, right) => BindArguments(context, state, left, right, arguments_), () => context);
}
function ResolveArgumentsContext(context, state, parameters, arguments_) {
  return BindParameters(context, state, parameters, arguments_);
}

// ../../node_modules/typebox/build/type/engine/call/instantiate.mjs
function Peek(state) {
  const result = guard_exports.IsGreaterThan(state.callstack.length, 0) ? state.callstack[state.callstack.length - 1] : "";
  return result;
}
function IsTailCall(state, name) {
  const result = guard_exports.IsEqual(Peek(state), name);
  return result;
}
function CallDispatch(context, state, target, parameters, expression, arguments_) {
  const argumentsContext = ResolveArgumentsContext(context, state, parameters, arguments_);
  const returnType = InstantiateType(argumentsContext, { callstack: [...state.callstack, target.$ref] }, expression);
  return InstantiateType(context, state, returnType);
}
function CallDistributed(context, state, target, parameters, expression, distributedArguments) {
  return distributedArguments.reduce((result, arguments_) => [...result, CallDispatch(context, state, target, parameters, expression, arguments_)], []);
}
function CallImmediate(context, state, target, parameters, expression, arguments_) {
  const distributedArguments = DistributeArguments(parameters, arguments_, expression);
  const returnTypes = CallDistributed(context, state, target, parameters, expression, distributedArguments);
  const result = guard_exports.IsEqual(returnTypes.length, 1) ? returnTypes[0] : EvaluateUnion(returnTypes);
  return result;
}
function CallInstantiate(context, state, target, arguments_) {
  const instantiatedArguments = InstantiateTypes(context, state, arguments_);
  const resolved = ResolveTarget(context, target, arguments_);
  const name = resolved[0];
  const type = resolved[1];
  const result = IsGeneric(type) ? IsTailCall(state, name) ? CallConstruct(Ref(name), instantiatedArguments) : CallImmediate(context, state, Ref(name), type.parameters, type.expression, instantiatedArguments) : CallConstruct(target, instantiatedArguments);
  return result;
}

// ../../node_modules/typebox/build/type/types/call.mjs
function CallConstruct(target, arguments_) {
  return memory_exports.Create({ ["~kind"]: "Call" }, { target, arguments: arguments_ }, {});
}
function Call(target, arguments_) {
  return CallInstantiate({}, { callstack: [] }, target, arguments_);
}
function IsCall(value) {
  return IsKind(value, "Call");
}

// ../../node_modules/typebox/build/type/engine/intrinsics/mapping.mjs
function ApplyMapping(mapping, value) {
  return mapping(value);
}

// ../../node_modules/typebox/build/type/engine/intrinsics/from_literal.mjs
function FromLiteral3(mapping, value) {
  return guard_exports.IsString(value) ? Literal(ApplyMapping(mapping, value)) : Literal(value);
}

// ../../node_modules/typebox/build/type/engine/intrinsics/from_template_literal.mjs
function FromTemplateLiteral(mapping, pattern) {
  const decoded = TemplateLiteralDecode(pattern);
  const result = FromType7(mapping, decoded);
  return result;
}

// ../../node_modules/typebox/build/type/engine/intrinsics/from_union.mjs
function FromUnion2(mapping, types) {
  const result = types.map((type) => FromType7(mapping, type));
  return Union(result);
}

// ../../node_modules/typebox/build/type/engine/intrinsics/from_type.mjs
function FromType7(mapping, type) {
  return IsLiteral(type) ? FromLiteral3(mapping, type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral(mapping, type.pattern) : IsUnion(type) ? FromUnion2(mapping, type.anyOf) : type;
}

// ../../node_modules/typebox/build/type/action/capitalize.mjs
function CapitalizeDeferred(type, options = {}) {
  return Deferred("Capitalize", [type], options);
}
function Capitalize(type, options = {}) {
  return CapitalizeAction(type, options);
}

// ../../node_modules/typebox/build/type/action/lowercase.mjs
function LowercaseDeferred(type, options = {}) {
  return Deferred("Lowercase", [type], options);
}
function Lowercase(type, options = {}) {
  return LowercaseAction(type, options);
}

// ../../node_modules/typebox/build/type/action/uncapitalize.mjs
function UncapitalizeDeferred(type, options = {}) {
  return Deferred("Uncapitalize", [type], options);
}
function Uncapitalize(type, options = {}) {
  return UncapitalizeAction(type, options);
}

// ../../node_modules/typebox/build/type/action/uppercase.mjs
function UppercaseDeferred(type, options = {}) {
  return Deferred("Uppercase", [type], options);
}
function Uppercase(type, options = {}) {
  return UppercaseAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/intrinsics/instantiate.mjs
var CapitalizeMapping = (input) => input[0].toUpperCase() + input.slice(1);
var LowercaseMapping = (input) => input.toLowerCase();
var UncapitalizeMapping = (input) => input[0].toLowerCase() + input.slice(1);
var UppercaseMapping = (input) => input.toUpperCase();
function CapitalizeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(CapitalizeMapping, type), {}, options) : CapitalizeDeferred(type, options);
  return result;
}
function LowercaseAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(LowercaseMapping, type), {}, options) : LowercaseDeferred(type, options);
  return result;
}
function UncapitalizeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(UncapitalizeMapping, type), {}, options) : UncapitalizeDeferred(type, options);
  return result;
}
function UppercaseAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(UppercaseMapping, type), {}, options) : UppercaseDeferred(type, options);
  return result;
}
function CapitalizeInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return CapitalizeAction(instantiatedType, options);
}
function LowercaseInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return LowercaseAction(instantiatedType, options);
}
function UncapitalizeInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return UncapitalizeAction(instantiatedType, options);
}
function UppercaseInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return UppercaseAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/conditional.mjs
function ConditionalDeferred(left, right, true_, false_, options = {}) {
  return Deferred("Conditional", [left, right, true_, false_], options);
}
function Conditional(left, right, true_, false_, options = {}) {
  return ConditionalAction({}, { callstack: [] }, left, right, true_, false_, options);
}

// ../../node_modules/typebox/build/type/engine/conditional/instantiate.mjs
function ConditionalOperation(context, state, left, right, true_, false_) {
  const extendsResult = Extends2(context, left, right);
  return result_exports.IsExtendsUnion(extendsResult) ? Union([InstantiateType(extendsResult.inferred, state, true_), InstantiateType(context, state, false_)]) : result_exports.IsExtendsTrue(extendsResult) ? InstantiateType(extendsResult.inferred, state, true_) : InstantiateType(context, state, false_);
}
function ConditionalAction(context, state, left, right, true_, false_, options) {
  const result = CanInstantiate([left, right]) ? memory_exports.Update(ConditionalOperation(context, state, left, right, true_, false_), {}, options) : ConditionalDeferred(left, right, true_, false_, options);
  return result;
}
function ConditionalInstantiate(context, state, left, right, true_, false_, options) {
  const instantiatedLeft = InstantiateType(context, state, left);
  const instantiatedRight = InstantiateType(context, state, right);
  return ConditionalAction(context, state, instantiatedLeft, instantiatedRight, true_, false_, options);
}

// ../../node_modules/typebox/build/type/action/constructor_parameters.mjs
function ConstructorParametersDeferred(type, options = {}) {
  return Deferred("ConstructorParameters", [type], options);
}
function ConstructorParameters(type, options = {}) {
  return ConstructorParametersAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/constructor_parameters/instantiate.mjs
function ConstructorParametersOperation(type) {
  const parameters = IsConstructor2(type) ? type["parameters"] : [];
  const instantiatedParameters = InstantiateElements({}, { callstack: [] }, parameters);
  const result = Tuple(instantiatedParameters);
  return result;
}
function ConstructorParametersAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(ConstructorParametersOperation(type), {}, options) : ConstructorParametersDeferred(type, options);
  return result;
}
function ConstructorParametersInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return ConstructorParametersAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/exclude.mjs
function ExcludeDeferred(left, right, options = {}) {
  return Deferred("Exclude", [left, right], options);
}
function Exclude(left, right, options = {}) {
  return ExcludeAction(left, right, options);
}

// ../../node_modules/typebox/build/type/engine/exclude/operation.mjs
function ExcludeUnionLeft(types, right) {
  return types.reduce((result, head) => {
    return [...result, ...ExcludeTypeLeft(head, right)];
  }, []);
}
function ExcludeTypeLeft(left, right) {
  const check = Extends2({}, left, right);
  const result = result_exports.IsExtendsTrueLike(check) ? [] : [left];
  return result;
}
function ExcludeOperation(left, right) {
  const remaining = IsEnum(left) ? ExcludeUnionLeft(EnumValuesToVariants(left.enum), right) : IsUnion(left) ? ExcludeUnionLeft(Flatten(left.anyOf), right) : ExcludeTypeLeft(left, right);
  const result = EvaluateUnion(remaining);
  return result;
}

// ../../node_modules/typebox/build/type/engine/exclude/instantiate.mjs
function ExcludeAction(left, right, options) {
  const result = CanInstantiate([left, right]) ? memory_exports.Update(ExcludeOperation(left, right), {}, options) : ExcludeDeferred(left, right, options);
  return result;
}
function ExcludeInstantiate(context, state, left, right, options) {
  const instantiatedLeft = InstantiateType(context, state, left);
  const instantiatedRight = InstantiateType(context, state, right);
  return ExcludeAction(instantiatedLeft, instantiatedRight, options);
}

// ../../node_modules/typebox/build/type/action/extract.mjs
function ExtractDeferred(left, right, options = {}) {
  return Deferred("Extract", [left, right], options);
}
function Extract(left, right, options = {}) {
  return ExtractAction(left, right, options);
}

// ../../node_modules/typebox/build/type/engine/extract/operation.mjs
function ExtractUnionLeft(types, right) {
  return types.reduce((result, head) => {
    return [...result, ...ExtractTypeLeft(head, right)];
  }, []);
}
function ExtractTypeLeft(left, right) {
  const check = Extends2({}, left, right);
  const result = result_exports.IsExtendsTrueLike(check) ? [left] : [];
  return result;
}
function ExtractOperation(left, right) {
  const remaining = IsEnum(left) ? ExtractUnionLeft(EnumValuesToVariants(left.enum), right) : IsUnion(left) ? ExtractUnionLeft(Flatten(left.anyOf), right) : ExtractTypeLeft(left, right);
  const result = EvaluateUnion(remaining);
  return result;
}

// ../../node_modules/typebox/build/type/engine/extract/instantiate.mjs
function ExtractAction(left, right, options) {
  const result = CanInstantiate([left, right]) ? memory_exports.Update(ExtractOperation(left, right), {}, options) : ExtractDeferred(left, right, options);
  return result;
}
function ExtractInstantiate(context, state, left, right, options) {
  const instantiatedLeft = InstantiateType(context, state, left);
  const instantiatedRight = InstantiateType(context, state, right);
  return ExtractAction(instantiatedLeft, instantiatedRight, options);
}

// ../../node_modules/typebox/build/type/engine/helpers/keys_to_indexer.mjs
function KeysToLiterals(keys) {
  return keys.reduce((result, left) => {
    return IsLiteralValue(left) ? [...result, Literal(left)] : result;
  }, []);
}
function KeysToIndexer(keys) {
  const literals = KeysToLiterals(keys);
  const result = Union(literals);
  return result;
}

// ../../node_modules/typebox/build/type/action/indexed.mjs
function IndexDeferred(type, indexer, options = {}) {
  return Deferred("Index", [type, indexer], options);
}
function Index(type, indexer_or_keys, options = {}) {
  const indexer = guard_exports.IsArray(indexer_or_keys) ? KeysToIndexer(indexer_or_keys) : indexer_or_keys;
  return IndexAction(type, indexer, options);
}

// ../../node_modules/typebox/build/type/engine/object/from_cyclic.mjs
function FromCyclic(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const result = FromType8(target);
  return result;
}

// ../../node_modules/typebox/build/type/engine/object/from_intersect.mjs
function CollapseIntersectProperties(left, right) {
  const leftKeys = guard_exports.Keys(left).filter((key) => !guard_exports.HasPropertyKey(right, key));
  const rightKeys = guard_exports.Keys(right).filter((key) => !guard_exports.HasPropertyKey(left, key));
  const sharedKeys = guard_exports.Keys(left).filter((key) => guard_exports.HasPropertyKey(right, key));
  const leftProperties = leftKeys.reduce((result, key) => ({ ...result, [key]: left[key] }), {});
  const rightProperties = rightKeys.reduce((result, key) => ({ ...result, [key]: right[key] }), {});
  const sharedProperties = sharedKeys.reduce((result, key) => ({ ...result, [key]: EvaluateIntersect([left[key], right[key]]) }), {});
  const unique = memory_exports.Assign(leftProperties, rightProperties);
  const shared = memory_exports.Assign(unique, sharedProperties);
  return shared;
}
function FromIntersect(types) {
  return types.reduce((result, left) => {
    return CollapseIntersectProperties(result, FromType8(left));
  }, {});
}

// ../../node_modules/typebox/build/type/engine/object/from_object.mjs
function FromObject2(properties) {
  return properties;
}

// ../../node_modules/typebox/build/type/engine/object/from_tuple.mjs
function FromTuple(types) {
  const object = TupleToObject(Tuple(types));
  const result = FromType8(object);
  return result;
}

// ../../node_modules/typebox/build/type/engine/object/from_union.mjs
function CollapseUnionProperties(left, right) {
  const sharedKeys = guard_exports.Keys(left).filter((key) => key in right);
  const result = sharedKeys.reduce((result2, key) => {
    return { ...result2, [key]: EvaluateUnion([left[key], right[key]]) };
  }, {});
  return result;
}
function ReduceVariants(types, result) {
  return guard_exports.TakeLeft(types, (left, right) => ReduceVariants(right, CollapseUnionProperties(result, FromType8(left))), () => result);
}
function FromUnion3(types) {
  return guard_exports.TakeLeft(types, (left, right) => ReduceVariants(right, FromType8(left)), () => Unreachable());
}

// ../../node_modules/typebox/build/type/engine/object/from_type.mjs
function FromType8(type) {
  return IsCyclic(type) ? FromCyclic(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect(type.allOf) : IsUnion(type) ? FromUnion3(type.anyOf) : IsTuple(type) ? FromTuple(type.items) : IsObject2(type) ? FromObject2(type.properties) : {};
}

// ../../node_modules/typebox/build/type/engine/object/collapse.mjs
function CollapseToObject(type) {
  const properties = FromType8(type);
  const result = _Object_(properties);
  return result;
}

// ../../node_modules/typebox/build/type/engine/helpers/keys.mjs
var integerKeyPattern = new RegExp("^(?:0|[1-9][0-9]*)$");
function ConvertToIntegerKey(value) {
  const normal = `${value}`;
  return integerKeyPattern.test(normal) ? parseInt(normal) : value;
}

// ../../node_modules/typebox/build/type/engine/indexed/from_array.mjs
function NormalizeLiteral(value) {
  return Literal(ConvertToIntegerKey(value));
}
function NormalizeIndexerTypes(types) {
  return types.map((type) => NormalizeIndexer(type));
}
function NormalizeIndexer(type) {
  return IsIntersect(type) ? Intersect(NormalizeIndexerTypes(type.allOf)) : IsUnion(type) ? Union(NormalizeIndexerTypes(type.anyOf)) : IsLiteral(type) ? NormalizeLiteral(type.const) : type;
}
function FromArray2(type, indexer) {
  const normalizedIndexer = NormalizeIndexer(indexer);
  const check = Extends2({}, normalizedIndexer, Number2());
  const result = (
    // indexer
    result_exports.IsExtendsTrueLike(check) ? type : IsLiteral(indexer) && guard_exports.IsEqual(indexer.const, "length") ? Number2() : Never()
  );
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_cyclic.mjs
function FromCyclic2(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const result = FromType9(target);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_union.mjs
function FromUnion4(types) {
  return types.reduce((result, left) => {
    return [...result, ...FromType9(left)];
  }, []);
}

// ../../node_modules/typebox/build/type/engine/indexable/from_enum.mjs
function FromEnum(values) {
  const variants = EnumValuesToVariants(values);
  const result = FromUnion4(variants);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_intersect.mjs
function FromIntersect2(types) {
  const evaluated = EvaluateIntersect(types);
  const result = FromType9(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_literal.mjs
function FromLiteral4(value) {
  const result = [`${value}`];
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_template_literal.mjs
function FromTemplateLiteral2(pattern) {
  const decoded = TemplateLiteralDecode(pattern);
  const result = FromType9(decoded);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_type.mjs
function FromType9(type) {
  return IsCyclic(type) ? FromCyclic2(type.$defs, type.$ref) : IsEnum(type) ? FromEnum(type.enum) : IsIntersect(type) ? FromIntersect2(type.allOf) : IsLiteral(type) ? FromLiteral4(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral2(type.pattern) : IsUnion(type) ? FromUnion4(type.anyOf) : [];
}

// ../../node_modules/typebox/build/type/engine/indexable/to_indexable_keys.mjs
function ToIndexableKeys(type) {
  const result = FromType9(type);
  return result;
}

// ../../node_modules/typebox/build/type/engine/this/expand_this.mjs
function FromTypes5(properties, types) {
  return types.map((type) => FromType10(properties, type));
}
function FromType10(properties, type) {
  return IsArray2(type) ? _Array_(FromType10(properties, type.items)) : IsAsyncIterator2(type) ? AsyncIterator(FromType10(properties, type.iteratorItems)) : IsConstructor2(type) ? Constructor(FromTypes5(properties, type.parameters), FromType10(properties, type.instanceType)) : IsFunction2(type) ? _Function_(FromTypes5(properties, type.parameters), FromType10(properties, type.returnType)) : IsIterator2(type) ? Iterator(FromType10(properties, type.iteratorItems)) : IsPromise(type) ? _Promise_(FromType10(properties, type.item)) : IsTuple(type) ? Tuple(FromTypes5(properties, type.items)) : IsUnion(type) ? Union(FromTypes5(properties, type.anyOf)) : IsIntersect(type) ? Intersect(FromTypes5(properties, type.allOf)) : IsThis(type) ? _Object_(properties) : type;
}
function ExpandThis(properties, type) {
  const result = FromType10(properties, type);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexed/from_object.mjs
function IndexProperty(properties, key) {
  const selectedType = key in properties ? properties[key] : Never();
  const result = ExpandThis(properties, selectedType);
  return result;
}
function IndexProperties(properties, keys) {
  return keys.reduce((result, left) => {
    return [...result, IndexProperty(properties, left)];
  }, []);
}
function FromIndexer(properties, indexer) {
  const keys = ToIndexableKeys(indexer);
  const variants = IndexProperties(properties, keys);
  const result = EvaluateUnion(variants);
  return result;
}
var NumericKeyPattern = new RegExp(IntegerKey);
function NumericKeys(keys) {
  const result = keys.filter((key) => NumericKeyPattern.test(key));
  return result;
}
function FromIndexerNumber(properties) {
  const keys = PropertyKeys(properties);
  const numericKeys = NumericKeys(keys);
  const variants = IndexProperties(properties, numericKeys);
  const result = EvaluateUnion(variants);
  return result;
}
function FromObject3(properties, indexer) {
  const result = IsNumber2(indexer) ? FromIndexerNumber(properties) : FromIndexer(properties, indexer);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexed/array_indexer.mjs
function ConvertLiteral(value) {
  return Literal(ConvertToIntegerKey(value));
}
function ArrayIndexerTypes(types) {
  return types.map((type) => FormatArrayIndexer(type));
}
function FormatArrayIndexer(type) {
  return IsIntersect(type) ? Intersect(ArrayIndexerTypes(type.allOf)) : IsUnion(type) ? Union(ArrayIndexerTypes(type.anyOf)) : IsLiteral(type) ? ConvertLiteral(type.const) : type;
}

// ../../node_modules/typebox/build/type/engine/indexed/from_tuple.mjs
function IndexElementsWithIndexer(types, indexer) {
  return types.reduceRight((result, right, index) => {
    const check = Extends2({}, Literal(index), indexer);
    return result_exports.IsExtendsTrueLike(check) ? [right, ...result] : result;
  }, []);
}
function FromTupleWithIndexer(types, indexer) {
  const formattedArrayIndexer = FormatArrayIndexer(indexer);
  const elements = IndexElementsWithIndexer(types, formattedArrayIndexer);
  return EvaluateUnionFast(elements);
}
function FromTupleWithoutIndexer(types) {
  return EvaluateUnionFast(types);
}
function FromTuple2(types, indexer) {
  return (
    // length (intrinsic)
    IsLiteral(indexer) && guard_exports.IsEqual(indexer.const, "length") ? Literal(types.length) : IsNumber2(indexer) || IsInteger2(indexer) ? FromTupleWithoutIndexer(types) : FromTupleWithIndexer(types, indexer)
  );
}

// ../../node_modules/typebox/build/type/engine/indexed/from_type.mjs
function FromType11(type, indexer) {
  return IsArray2(type) ? FromArray2(type.items, indexer) : IsObject2(type) ? FromObject3(type.properties, indexer) : IsTuple(type) ? FromTuple2(type.items, indexer) : Never();
}

// ../../node_modules/typebox/build/type/engine/indexed/instantiate.mjs
function NormalizeType(type) {
  const result = IsCyclic(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
  return result;
}
function IndexAction(type, indexer, options) {
  const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType11(NormalizeType(type), indexer), {}, options) : IndexDeferred(type, indexer, options);
  return result;
}
function IndexInstantiate(context, state, type, indexer, options) {
  const instantiatedType = InstantiateType(context, state, type);
  const instantiatedIndexer = InstantiateType(context, state, indexer);
  return IndexAction(instantiatedType, instantiatedIndexer, options);
}

// ../../node_modules/typebox/build/type/action/instance_type.mjs
function InstanceTypeDeferred(type, options = {}) {
  return Deferred("InstanceType", [type], options);
}
function InstanceType(type, options = {}) {
  return InstanceTypeAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/instance_type/instantiate.mjs
function InstanceTypeOperation(type) {
  return IsConstructor2(type) ? type["instanceType"] : Never();
}
function InstanceTypeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(InstanceTypeOperation(type), {}, options) : InstanceTypeDeferred(type, options);
  return result;
}
function InstanceTypeInstantiate(context, state, type, options = {}) {
  const instantiatedType = InstantiateType(context, state, type);
  return InstanceTypeAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/keyof.mjs
function KeyOfDeferred(type, options = {}) {
  return Deferred("KeyOf", [type], options);
}
function KeyOf2(type, options = {}) {
  return KeyOfAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/keyof/from_any.mjs
function FromAny() {
  return Union([Number2(), String2(), Symbol2()]);
}

// ../../node_modules/typebox/build/type/engine/keyof/from_array.mjs
function FromArray3(_type) {
  return Number2();
}

// ../../node_modules/typebox/build/type/engine/keyof/from_object.mjs
function FromPropertyKeys(keys) {
  const result = keys.reduce((result2, left) => {
    return IsLiteralValue(left) ? [...result2, Literal(ConvertToIntegerKey(left))] : Unreachable();
  }, []);
  return result;
}
function FromObject4(properties) {
  const propertyKeys = guard_exports.Keys(properties);
  const variants = FromPropertyKeys(propertyKeys);
  const result = EvaluateUnionFast(variants);
  return result;
}

// ../../node_modules/typebox/build/type/engine/keyof/from_record.mjs
function FromRecord(type) {
  return RecordKey(type);
}

// ../../node_modules/typebox/build/type/engine/keyof/from_tuple.mjs
function FromTuple3(types) {
  const result = types.map((_, index) => Literal(index));
  return EvaluateUnionFast(result);
}

// ../../node_modules/typebox/build/type/engine/keyof/from_type.mjs
function FromType12(type) {
  return IsAny(type) ? FromAny() : IsArray2(type) ? FromArray3(type.items) : IsObject2(type) ? FromObject4(type.properties) : IsRecord(type) ? FromRecord(type) : IsTuple(type) ? FromTuple3(type.items) : Never();
}

// ../../node_modules/typebox/build/type/engine/keyof/instantiate.mjs
function NormalizeType2(type) {
  const result = IsCyclic(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
  return result;
}
function KeyOfAction(type, options) {
  return CanInstantiate([type]) ? memory_exports.Update(FromType12(NormalizeType2(type)), {}, options) : KeyOfDeferred(type, options);
}
function KeyOfInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return KeyOfAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/mapped.mjs
function MappedDeferred(identifier, type, as, property, options = {}) {
  return Deferred("Mapped", [identifier, type, as, property], options);
}
function Mapped2(identifier, type, as, property, options = {}) {
  return MappedAction({}, { callstack: [] }, identifier, type, as, property, options);
}

// ../../node_modules/typebox/build/type/engine/mapped/mapped_variants.mjs
function FromTemplateLiteral3(pattern) {
  const decoded = TemplateLiteralDecode(pattern);
  const result = FromType13(decoded);
  return result;
}
function FromUnion5(types) {
  return types.reduce((result, left) => {
    return [...result, ...FromType13(left)];
  }, []);
}
function FromLiteral5(value) {
  const result = guard_exports.IsNumber(value) ? [Literal(`${value}`)] : [Literal(value)];
  return result;
}
function FromType13(type) {
  const result = IsEnum(type) ? FromUnion5(EnumValuesToVariants(type.enum)) : IsLiteral(type) ? FromLiteral5(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral3(type.pattern) : IsUnion(type) ? FromUnion5(type.anyOf) : [type];
  return result;
}
function MappedVariants(type) {
  const result = FromType13(type);
  return result;
}

// ../../node_modules/typebox/build/type/engine/mapped/mapped_operation.mjs
function CanonicalAs(instantiatedAs) {
  const result = IsTemplateLiteral(instantiatedAs) ? TemplateLiteralDecode(instantiatedAs.pattern) : instantiatedAs;
  return result;
}
function MappedVariant(context, state, identifier, variant, as, property) {
  const variantContext = memory_exports.Assign(context, { [identifier["name"]]: variant });
  const instantiatedAs = InstantiateType(variantContext, state, as);
  const canonicalAs = CanonicalAs(instantiatedAs);
  const instantiatedProperty = InstantiateType(variantContext, state, property);
  return IsLiteralNumber(canonicalAs) || IsLiteralString(canonicalAs) ? { [canonicalAs.const]: instantiatedProperty } : {};
}
function MappedProperties(context, state, identifier, variants, as, property) {
  return variants.reduce((result, left) => {
    return [...result, MappedVariant(context, state, identifier, left, as, property)];
  }, []);
}
function MappedObjects(properties) {
  return properties.reduce((result, left) => {
    return [...result, _Object_(left)];
  }, []);
}
function MappedOperation(context, state, identifier, type, as, property) {
  const variants = MappedVariants(type);
  const mappedProperties = MappedProperties(context, state, identifier, variants, as, property);
  const mappedObjects = MappedObjects(mappedProperties);
  const result = EvaluateIntersect(mappedObjects);
  return result;
}

// ../../node_modules/typebox/build/type/engine/mapped/instantiate.mjs
function MappedAction(context, state, identifier, type, as, property, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(MappedOperation(context, state, identifier, type, as, property), {}, options) : MappedDeferred(identifier, type, as, property, options);
  return result;
}
function MappedInstantiate(context, state, identifier, type, as, property, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return MappedAction(context, state, identifier, instantiatedType, as, property, options);
}

// ../../node_modules/typebox/build/type/engine/module/instantiate.mjs
function InstantiateCyclics(context, cyclicKeys) {
  const keys = guard_exports.Keys(context).filter((key) => cyclicKeys.includes(key));
  return keys.reduce((result, key) => {
    return { ...result, [key]: InstantiateCyclic(context, key, context[key]) };
  }, {});
}
function InstantiateNonCyclics(context, cyclicKeys) {
  const keys = guard_exports.Keys(context).filter((key) => !cyclicKeys.includes(key));
  return keys.reduce((result, key) => {
    return { ...result, [key]: InstantiateType(context, { callstack: [] }, context[key]) };
  }, {});
}
function InstantiateModule(context, options) {
  const cyclicCandidates = CyclicCandidates(context);
  const instantiatedCyclics = InstantiateCyclics(context, cyclicCandidates);
  const instantiatedNonCyclics = InstantiateNonCyclics(context, cyclicCandidates);
  const instantiatedModule = { ...instantiatedCyclics, ...instantiatedNonCyclics };
  return memory_exports.Update(instantiatedModule, {}, options);
}
function ModuleInstantiate(context, _state, properties, options) {
  const moduleContext = memory_exports.Assign(context, properties);
  const instantiatedModule = InstantiateModule(moduleContext, options);
  return instantiatedModule;
}

// ../../node_modules/typebox/build/type/action/non_nullable.mjs
function NonNullableDeferred(type, options = {}) {
  return Deferred("NonNullable", [type], options);
}
function NonNullable(type, options = {}) {
  return NonNullableAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/non_nullable/instantiate.mjs
function NonNullableOperation(type) {
  const excluded = Union([Null(), Undefined()]);
  return ExcludeAction(type, excluded, {});
}
function NonNullableAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(NonNullableOperation(type), {}, options) : NonNullableDeferred(type, options);
  return result;
}
function NonNullableInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return NonNullableAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/omit.mjs
function OmitDeferred(type, indexer, options = {}) {
  return Deferred("Omit", [type, indexer], options);
}
function Omit(type, indexer_or_keys, options = {}) {
  const indexer = guard_exports.IsArray(indexer_or_keys) ? KeysToIndexer(indexer_or_keys) : indexer_or_keys;
  return OmitAction(type, indexer, options);
}

// ../../node_modules/typebox/build/type/engine/indexable/to_indexable.mjs
function ToIndexable(type) {
  const collapsed = CollapseToObject(type);
  const result = IsObject2(collapsed) ? collapsed.properties : Unreachable();
  return result;
}

// ../../node_modules/typebox/build/type/engine/omit/from_type.mjs
function FromKeys(properties, keys) {
  const result = guard_exports.Keys(properties).reduce((result2, key) => {
    return keys.includes(key) ? result2 : { ...result2, [key]: properties[key] };
  }, {});
  return result;
}
function FromType14(type, indexer) {
  const indexable = ToIndexable(type);
  const indexableKeys = ToIndexableKeys(indexer);
  const omitted = FromKeys(indexable, indexableKeys);
  const result = _Object_(omitted);
  return result;
}

// ../../node_modules/typebox/build/type/engine/omit/instantiate.mjs
function OmitAction(type, indexer, options) {
  const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType14(type, indexer), {}, options) : OmitDeferred(type, indexer, options);
  return result;
}
function OmitInstantiate(context, state, type, indexer, options) {
  const instantiatedType = InstantiateType(context, state, type);
  const instantiatedIndexer = InstantiateType(context, state, indexer);
  return OmitAction(instantiatedType, instantiatedIndexer, options);
}

// ../../node_modules/typebox/build/type/action/options.mjs
function OptionsDeferred(type, options) {
  return Deferred("Options", [type, options], {});
}
function Options2(type, options) {
  return OptionsAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/options/instantiate.mjs
function OptionsAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(type, {}, options) : OptionsDeferred(type, options);
  return result;
}
function OptionsInstantiate(context, state, type, options) {
  const instaniatedType = InstantiateType(context, state, type);
  return OptionsAction(instaniatedType, options);
}

// ../../node_modules/typebox/build/type/action/parameters.mjs
function ParametersDeferred(type, options = {}) {
  return Deferred("Parameters", [type], options);
}
function Parameters(type, options = {}) {
  return ParametersAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/parameters/instantiate.mjs
function ParametersOperation(type) {
  const parameters = IsFunction2(type) ? type["parameters"] : [];
  const instantiatedParameters = InstantiateElements({}, { callstack: [] }, parameters);
  const result = Tuple(instantiatedParameters);
  return result;
}
function ParametersAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(ParametersOperation(type), {}, options) : ParametersDeferred(type, options);
  return result;
}
function ParametersInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return ParametersAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/partial.mjs
function PartialDeferred(type, options = {}) {
  return Deferred("Partial", [type], options);
}
function Partial(type, options = {}) {
  return PartialAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/partial/from_cyclic.mjs
function FromCyclic3(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const partial = FromType15(target);
  const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
  return result;
}

// ../../node_modules/typebox/build/type/engine/partial/from_intersect.mjs
function FromIntersect3(types) {
  const result = types.map((type) => FromType15(type));
  return EvaluateIntersect(result);
}

// ../../node_modules/typebox/build/type/engine/partial/from_union.mjs
function FromUnion6(types) {
  const result = types.map((type) => FromType15(type));
  return Union(result);
}

// ../../node_modules/typebox/build/type/engine/partial/from_object.mjs
function FromObject5(properties) {
  const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
    return { ...result2, [left]: Optional(properties[left]) };
  }, {});
  const result = _Object_(mapped);
  return result;
}

// ../../node_modules/typebox/build/type/engine/partial/from_type.mjs
function FromType15(type) {
  return IsCyclic(type) ? FromCyclic3(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect3(type.allOf) : IsUnion(type) ? FromUnion6(type.anyOf) : IsObject2(type) ? FromObject5(type.properties) : _Object_({});
}

// ../../node_modules/typebox/build/type/engine/partial/instantiate.mjs
function PartialAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType15(type), {}, options) : PartialDeferred(type, options);
  return result;
}
function PartialInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return PartialAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/pick.mjs
function PickDeferred(type, indexer, options = {}) {
  return Deferred("Pick", [type, indexer], options);
}
function Pick(type, indexer_or_keys, options = {}) {
  const indexer = guard_exports.IsArray(indexer_or_keys) ? KeysToIndexer(indexer_or_keys) : indexer_or_keys;
  return PickAction(type, indexer, options);
}

// ../../node_modules/typebox/build/type/engine/pick/from_type.mjs
function FromKeys2(properties, keys) {
  const result = guard_exports.Keys(properties).reduce((result2, key) => {
    return keys.includes(key) ? memory_exports.Assign(result2, { [key]: properties[key] }) : result2;
  }, {});
  return result;
}
function FromType16(type, indexer) {
  const indexable = ToIndexable(type);
  const keys = ToIndexableKeys(indexer);
  const applied = FromKeys2(indexable, keys);
  const result = _Object_(applied);
  return result;
}

// ../../node_modules/typebox/build/type/engine/pick/instantiate.mjs
function PickAction(type, indexer, options) {
  const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType16(type, indexer), {}, options) : PickDeferred(type, indexer, options);
  return result;
}
function PickInstantiate(context, state, type, indexer, options) {
  const instantiatedType = InstantiateType(context, state, type);
  const instantiatedIndexer = InstantiateType(context, state, indexer);
  return PickAction(instantiatedType, instantiatedIndexer, options);
}

// ../../node_modules/typebox/build/type/action/readonly_object.mjs
function ReadonlyObjectDeferred(type, options = {}) {
  return Deferred("ReadonlyObject", [type], options);
}
function ReadonlyObject(type, options = {}) {
  return ReadonlyObjectAction(type, options);
}
var ReadonlyType = ReadonlyObject;

// ../../node_modules/typebox/build/type/engine/readonly_object/from_array.mjs
function FromArray4(type) {
  const result = Immutable(_Array_(type));
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_cyclic.mjs
function FromCyclic4(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const partial = FromType17(target);
  const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_intersect.mjs
function FromIntersect4(types) {
  const result = types.map((type) => FromType17(type));
  return EvaluateIntersect(result);
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_object.mjs
function FromObject6(properties) {
  const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
    return { ...result2, [left]: Readonly(properties[left]) };
  }, {});
  const result = _Object_(mapped);
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_tuple.mjs
function FromTuple4(types) {
  const result = Immutable(Tuple(types));
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_union.mjs
function FromUnion7(types) {
  const result = types.map((type) => FromType17(type));
  return Union(result);
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_type.mjs
function FromType17(type) {
  return IsArray2(type) ? FromArray4(type.items) : IsCyclic(type) ? FromCyclic4(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect4(type.allOf) : IsObject2(type) ? FromObject6(type.properties) : IsTuple(type) ? FromTuple4(type.items) : IsUnion(type) ? FromUnion7(type.anyOf) : type;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/instantiate.mjs
function ReadonlyObjectAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType17(type), {}, options) : ReadonlyObjectDeferred(type);
  return result;
}
function ReadonlyObjectInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return ReadonlyObjectAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/engine/ref/instantiate.mjs
function RefInstantiate(context, state, type, ref) {
  return ref in context ? CyclicCheck([ref], context, context[ref]) ? type : InstantiateType(context, state, context[ref]) : type;
}

// ../../node_modules/typebox/build/type/engine/required/from_cyclic.mjs
function FromCyclic5(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const partial = FromType18(target);
  const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
  return result;
}

// ../../node_modules/typebox/build/type/engine/required/from_intersect.mjs
function FromIntersect5(types) {
  const result = types.map((type) => FromType18(type));
  return EvaluateIntersect(result);
}

// ../../node_modules/typebox/build/type/engine/required/from_union.mjs
function FromUnion8(types) {
  const result = types.map((type) => FromType18(type));
  return Union(result);
}

// ../../node_modules/typebox/build/type/engine/required/from_object.mjs
function FromObject7(properties) {
  const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
    return { ...result2, [left]: OptionalRemove(properties[left]) };
  }, {});
  const result = _Object_(mapped);
  return result;
}

// ../../node_modules/typebox/build/type/engine/required/from_type.mjs
function FromType18(type) {
  return IsCyclic(type) ? FromCyclic5(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect5(type.allOf) : IsUnion(type) ? FromUnion8(type.anyOf) : IsObject2(type) ? FromObject7(type.properties) : _Object_({});
}

// ../../node_modules/typebox/build/type/action/required.mjs
function RequiredDeferred(type, options = {}) {
  return Deferred("Required", [type], options);
}
function Required(type, options = {}) {
  return RequiredAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/required/instantiate.mjs
function RequiredAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType18(type), {}, options) : RequiredDeferred(type, options);
  return result;
}
function RequiredInstantiate(context, state, type, options) {
  const instaniatedType = InstantiateType(context, state, type);
  return RequiredAction(instaniatedType, options);
}

// ../../node_modules/typebox/build/type/action/return_type.mjs
function ReturnTypeDeferred(type, options = {}) {
  return Deferred("ReturnType", [type], options);
}
function ReturnType(type, options = {}) {
  return ReturnTypeAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/return_type/instantiate.mjs
function ReturnTypeOperation(type) {
  return IsFunction2(type) ? type["returnType"] : Never();
}
function ReturnTypeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(ReturnTypeOperation(type), {}, options) : ReturnTypeDeferred(type, options);
  return result;
}
function ReturnTypeInstantiate(context, state, type, options = {}) {
  const instantiatedType = InstantiateType(context, state, type);
  return ReturnTypeAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/engine/rest/spread.mjs
function SpreadElement(type) {
  const result = IsRest(type) ? IsTuple(type.items) ? RestSpread(type.items.items) : IsInfer(type.items) ? [type] : IsRef(type.items) ? [type] : [Never()] : [type];
  return result;
}
function RestSpread(types) {
  const result = types.reduce((result2, left) => {
    return [...result2, ...SpreadElement(left)];
  }, []);
  return result;
}

// ../../node_modules/typebox/build/type/engine/instantiate.mjs
function CanInstantiate(types) {
  return guard_exports.TakeLeft(types, (left, right) => IsRef(left) ? false : CanInstantiate(right), () => true);
}
function ModifierActions(type, readonly, optional) {
  return IsReadonlyRemoveAction(type) ? ModifierActions(type.type, "remove", optional) : IsOptionalRemoveAction(type) ? ModifierActions(type.type, readonly, "remove") : IsReadonlyAddAction(type) ? ModifierActions(type.type, "add", optional) : IsOptionalAddAction(type) ? ModifierActions(type.type, readonly, "add") : [type, readonly, optional];
}
function ApplyReadonly2(action, type) {
  return guard_exports.IsEqual(action, "remove") ? ReadonlyRemove(type) : guard_exports.IsEqual(action, "add") ? ReadonlyAdd(type) : type;
}
function ApplyOptional2(action, type) {
  return guard_exports.IsEqual(action, "remove") ? OptionalRemove(type) : guard_exports.IsEqual(action, "add") ? OptionalAdd(type) : type;
}
function InstantiateProperties(context, state, properties) {
  return guard_exports.Keys(properties).reduce((result, key) => {
    return { ...result, [key]: InstantiateType(context, state, properties[key]) };
  }, {});
}
function InstantiateElements(context, state, types) {
  const elements = InstantiateTypes(context, state, types);
  const result = RestSpread(elements);
  return result;
}
function InstantiateTypes(context, state, types) {
  return types.map((type) => InstantiateType(context, state, type));
}
function InstantiateDeferred(context, state, action, parameters, options) {
  return guard_exports.IsEqual(action, "Awaited") ? AwaitedInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Capitalize") ? CapitalizeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Conditional") ? ConditionalInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : guard_exports.IsEqual(action, "ConstructorParameters") ? ConstructorParametersInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Evaluate") ? EvaluateInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Exclude") ? ExcludeInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Extract") ? ExtractInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Index") ? IndexInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "InstanceType") ? InstanceTypeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Interface") ? InterfaceInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "KeyOf") ? KeyOfInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Lowercase") ? LowercaseInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Mapped") ? MappedInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : guard_exports.IsEqual(action, "Module") ? ModuleInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "NonNullable") ? NonNullableInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Pick") ? PickInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Options") ? OptionsInstantiate(context, state, parameters[0], parameters[1]) : guard_exports.IsEqual(action, "Parameters") ? ParametersInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Partial") ? PartialInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Omit") ? OmitInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "ReadonlyObject") ? ReadonlyObjectInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Record") ? RecordInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Required") ? RequiredInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "ReturnType") ? ReturnTypeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "TemplateLiteral") ? TemplateLiteralInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Uncapitalize") ? UncapitalizeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Uppercase") ? UppercaseInstantiate(context, state, parameters[0], options) : Deferred(action, parameters, options);
}
function InstantiateType(context, state, input) {
  const immutable = IsImmutable(input);
  const modifiers = ModifierActions(input, IsReadonly(input) ? "add" : "none", IsOptional(input) ? "add" : "none");
  const type = IsBase(modifiers[0]) ? modifiers[0].Clone() : modifiers[0];
  const instantiated = IsRef(type) ? RefInstantiate(context, state, type, type.$ref) : IsArray2(type) ? _Array_(InstantiateType(context, state, type.items), ArrayOptions(type)) : IsAsyncIterator2(type) ? AsyncIterator(InstantiateType(context, state, type.iteratorItems), AsyncIteratorOptions(type)) : IsCall(type) ? CallInstantiate(context, state, type.target, type.arguments) : IsConstructor2(type) ? Constructor(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.instanceType), ConstructorOptions(type)) : IsDeferred(type) ? InstantiateDeferred(context, state, type.action, type.parameters, type.options) : IsFunction2(type) ? _Function_(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.returnType), FunctionOptions(type)) : IsIntersect(type) ? Intersect(InstantiateTypes(context, state, type.allOf), IntersectOptions(type)) : IsIterator2(type) ? Iterator(InstantiateType(context, state, type.iteratorItems), IteratorOptions(type)) : IsObject2(type) ? _Object_(InstantiateProperties(context, state, type.properties), ObjectOptions(type)) : IsPromise(type) ? _Promise_(InstantiateType(context, state, type.item), PromiseOptions(type)) : IsRecord(type) ? RecordFromPattern(RecordPattern(type), InstantiateType(context, state, RecordValue(type))) : IsRest(type) ? Rest(InstantiateType(context, state, type.items)) : IsTuple(type) ? Tuple(InstantiateElements(context, state, type.items), TupleOptions(type)) : IsUnion(type) ? Union(InstantiateTypes(context, state, type.anyOf), UnionOptions(type)) : type;
  const withImmutable = immutable ? Immutable(instantiated) : instantiated;
  const withModifiers = ApplyReadonly2(modifiers[1], ApplyOptional2(modifiers[2], withImmutable));
  return withModifiers;
}
function Instantiate(context, type) {
  return InstantiateType(context, { callstack: [] }, type);
}

// ../../node_modules/typebox/build/type/engine/awaited/instantiate.mjs
function AwaitedOperation(type) {
  return IsPromise(type) ? AwaitedOperation(type.item) : type;
}
function AwaitedAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(AwaitedOperation(type), {}, options) : AwaitedDeferred(type, options);
  return result;
}
function AwaitedInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return AwaitedAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/awaited.mjs
function AwaitedDeferred(type, options = {}) {
  return Deferred("Awaited", [type], options);
}
function Awaited(type, options = {}) {
  return AwaitedAction(type, options);
}

// ../../node_modules/typebox/build/type/action/evaluate.mjs
function EvaluateDeferred(type, options = {}) {
  return Deferred("Evaluate", [type], options);
}
function Evaluate(type, options = {}) {
  return EvaluateAction(type, options);
}

// ../../node_modules/typebox/build/type/action/module.mjs
function ModuleDeferred(context, options = {}) {
  return Deferred("Module", [context], options);
}
function Module2(context, options = {}) {
  return Instantiate({}, ModuleDeferred(context, options));
}

// ../../node_modules/typebox/build/type/script/script.mjs
function Script2(...args) {
  const [context, input, options] = arguments_exports.Match(args, {
    2: (script, options2) => guard_exports.IsString(script) ? [{}, script, options2] : [script, options2, {}],
    3: (context2, script, options2) => [context2, script, options2],
    1: (script) => [{}, script, {}]
  });
  const result = Script(input);
  const parsed = guard_exports.IsArray(result) && guard_exports.IsEqual(result.length, 2) ? InstantiateType(context, { callstack: [] }, result[0]) : Never();
  return memory_exports.Update(parsed, {}, options);
}

// ../../node_modules/typebox/build/typebox.mjs
var typebox_exports = {};
__export(typebox_exports, {
  Any: () => Any,
  Array: () => _Array_,
  AsyncIterator: () => AsyncIterator,
  Awaited: () => Awaited,
  Base: () => Base,
  BigInt: () => BigInt2,
  Boolean: () => Boolean2,
  Call: () => Call,
  Capitalize: () => Capitalize,
  Codec: () => Codec,
  Conditional: () => Conditional,
  Constructor: () => Constructor,
  ConstructorParameters: () => ConstructorParameters,
  Cyclic: () => Cyclic,
  Decode: () => Decode,
  DecodeBuilder: () => DecodeBuilder,
  Encode: () => Encode,
  EncodeBuilder: () => EncodeBuilder,
  Enum: () => Enum,
  Evaluate: () => Evaluate,
  Exclude: () => Exclude,
  Extends: () => Extends2,
  ExtendsResult: () => result_exports,
  Extract: () => Extract,
  Function: () => _Function_,
  Generic: () => Generic,
  Identifier: () => Identifier,
  Immutable: () => Immutable,
  Index: () => Index,
  Infer: () => Infer,
  InstanceType: () => InstanceType,
  Instantiate: () => Instantiate,
  Integer: () => Integer,
  Interface: () => Interface,
  Intersect: () => Intersect,
  IsAny: () => IsAny,
  IsArray: () => IsArray2,
  IsAsyncIterator: () => IsAsyncIterator2,
  IsBase: () => IsBase,
  IsBigInt: () => IsBigInt2,
  IsBoolean: () => IsBoolean2,
  IsCall: () => IsCall,
  IsCodec: () => IsCodec,
  IsConstructor: () => IsConstructor2,
  IsCyclic: () => IsCyclic,
  IsEnum: () => IsEnum,
  IsFunction: () => IsFunction2,
  IsGeneric: () => IsGeneric,
  IsIdentifier: () => IsIdentifier,
  IsImmutable: () => IsImmutable,
  IsInfer: () => IsInfer,
  IsInteger: () => IsInteger2,
  IsIntersect: () => IsIntersect,
  IsIterator: () => IsIterator2,
  IsKind: () => IsKind,
  IsLiteral: () => IsLiteral,
  IsNever: () => IsNever,
  IsNull: () => IsNull2,
  IsNumber: () => IsNumber2,
  IsObject: () => IsObject2,
  IsOptional: () => IsOptional,
  IsParameter: () => IsParameter,
  IsPromise: () => IsPromise,
  IsReadonly: () => IsReadonly,
  IsRecord: () => IsRecord,
  IsRef: () => IsRef,
  IsRefine: () => IsRefine,
  IsRest: () => IsRest,
  IsSchema: () => IsSchema,
  IsString: () => IsString2,
  IsSymbol: () => IsSymbol2,
  IsTemplateLiteral: () => IsTemplateLiteral,
  IsThis: () => IsThis,
  IsTuple: () => IsTuple,
  IsUndefined: () => IsUndefined2,
  IsUnion: () => IsUnion,
  IsUnknown: () => IsUnknown,
  IsUnsafe: () => IsUnsafe,
  IsVoid: () => IsVoid,
  Iterator: () => Iterator,
  KeyOf: () => KeyOf2,
  Literal: () => Literal,
  Lowercase: () => Lowercase,
  Mapped: () => Mapped2,
  Module: () => Module2,
  Never: () => Never,
  NonNullable: () => NonNullable,
  Null: () => Null,
  Number: () => Number2,
  Object: () => _Object_,
  Omit: () => Omit,
  Optional: () => Optional,
  Options: () => Options2,
  Parameter: () => Parameter,
  Parameters: () => Parameters,
  Partial: () => Partial,
  Pick: () => Pick,
  Promise: () => _Promise_,
  Readonly: () => Readonly,
  ReadonlyObject: () => ReadonlyObject,
  ReadonlyType: () => ReadonlyType,
  Record: () => Record,
  RecordKey: () => RecordKey,
  RecordPattern: () => RecordPattern,
  RecordValue: () => RecordValue,
  Ref: () => Ref,
  Refine: () => Refine,
  Required: () => Required,
  Rest: () => Rest,
  ReturnType: () => ReturnType,
  Script: () => Script2,
  String: () => String2,
  Symbol: () => Symbol2,
  TemplateLiteral: () => TemplateLiteral2,
  This: () => This,
  Tuple: () => Tuple,
  Uncapitalize: () => Uncapitalize,
  Undefined: () => Undefined,
  Union: () => Union,
  Unknown: () => Unknown,
  Unsafe: () => Unsafe,
  Uppercase: () => Uppercase,
  Void: () => Void
});

// .build-npm/soul/soul.temp.ts
import { debugLog } from "@vtstech/pi-shared/debug";
import { EXTENSION_VERSION } from "@vtstech/pi-shared/ollama";
import path from "path";
var Environment = /* @__PURE__ */ ((Environment2) => {
  Environment2["VIRTUAL"] = "virtual";
  Environment2["EMBODIED"] = "embodied";
  Environment2["HYBRID"] = "hybrid";
  return Environment2;
})(Environment || {});
var InteractionMode = /* @__PURE__ */ ((InteractionMode2) => {
  InteractionMode2["TEXT"] = "text";
  InteractionMode2["VOICE"] = "voice";
  InteractionMode2["MULTIMODAL"] = "multimodal";
  InteractionMode2["GESTURE"] = "gesture";
  return InteractionMode2;
})(InteractionMode || {});
var ContactPolicy = /* @__PURE__ */ ((ContactPolicy2) => {
  ContactPolicy2["NO_CONTACT"] = "no-contact";
  ContactPolicy2["GENTLE_CONTACT"] = "gentle-contact";
  ContactPolicy2["FULL_CONTACT"] = "full-contact";
  return ContactPolicy2;
})(ContactPolicy || {});
var Mobility = /* @__PURE__ */ ((Mobility2) => {
  Mobility2["STATIONARY"] = "stationary";
  Mobility2["MOBILE"] = "mobile";
  Mobility2["LIMITED"] = "limited";
  return Mobility2;
})(Mobility || {});
var SoulSpecLoader = class {
  constructor() {
    __publicField(this, "cache", /* @__PURE__ */ new Map());
    __publicField(this, "soulsDirs");
    this.soulsDirs = [
      "~/.pi/agent/souls",
      // Global souls directory
      ".pi/souls",
      // Project-local souls directory
      "./souls"
      // Current directory souls
    ];
  }
  resolveSoulPath(path2) {
    const locations = [
      path2,
      // Absolute or relative path
      ...this.soulsDirs.map((dir) => `${dir}/${path2}`)
      // All configured souls directories
    ];
    for (const location of locations) {
      try {
        if (__require("fs").existsSync(location)) {
          return location;
        }
      } catch {
        continue;
      }
    }
    return null;
  }
  async load(soulPath, level = 2) {
    const resolvedPath = this.resolveSoulPath(soulPath);
    if (!resolvedPath) {
      throw new Error(`Soul not found: ${soulPath}`);
    }
    const cacheKey = `${resolvedPath}:${level}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    const soulDir = __require("fs").statSync(resolvedPath).isFile() ? path.dirname(resolvedPath) : resolvedPath;
    const manifestPath = path.join(soulDir, "soul.json");
    if (!__require("fs").existsSync(manifestPath)) {
      throw new Error(`No soul.json found at: ${manifestPath}`);
    }
    const manifestData = JSON.parse(__require("fs").readFileSync(manifestPath, "utf-8"));
    const manifest = this.parseManifest(manifestData, soulDir);
    if (level >= 2) {
      await this.loadLevel2(manifest, soulDir);
    }
    if (level >= 3) {
      await this.loadLevel3(manifest, soulDir);
    }
    this.cache.set(cacheKey, manifest);
    return manifest;
  }
  parseManifest(data, soulDir) {
    debugLog("soul", `Parsing soul manifest: ${data.name}`);
    const author = {
      name: data.author?.name || "Unknown",
      github: data.author?.github,
      email: data.author?.email
    };
    const compatibility = {
      openclaw: data.compatibility?.openclaw,
      models: data.compatibility?.models || [],
      frameworks: data.compatibility?.frameworks || [],
      min_token_context: data.compatibility?.minTokenContext
    };
    const recommendedSkills = [];
    const skillsData = data.recommendedSkills || data.skills || [];
    for (const skill of skillsData) {
      if (typeof skill === "string") {
        recommendedSkills.push({ name: skill, required: false });
      } else {
        recommendedSkills.push({
          name: skill.name,
          version: skill.version,
          required: skill.required || false
        });
      }
    }
    const files = {
      soul: data.files?.soul || "SOUL.md",
      identity: data.files?.identity,
      agents: data.files?.agents,
      heartbeat: data.files?.heartbeat,
      style: data.files?.style,
      user_template: data.files?.userTemplate,
      avatar: data.files?.avatar
    };
    const examples = data.examples ? {
      good: data.examples.good,
      bad: data.examples.bad
    } : void 0;
    const disclosure = data.disclosure ? {
      summary: data.disclosure.summary
    } : void 0;
    const hardwareConstraints = data.hardwareConstraints ? {
      has_display: data.hardwareConstraints.hasDisplay || false,
      has_speaker: data.hardwareConstraints.hasSpeaker || false,
      has_microphone: data.hardwareConstraints.hasMicrophone || false,
      has_camera: data.hardwareConstraints.hasCamera || false,
      mobility: Mobility[data.hardwareConstraints.mobility] || "stationary" /* STATIONARY */,
      manipulator: data.hardwareConstraints.manipulator || false
    } : void 0;
    const safety = data.safety ? {
      physical: data.safety.physical ? {
        contact_policy: ContactPolicy[data.safety.physical.contactPolicy] || "no-contact" /* NO_CONTACT */,
        emergency_protocol: data.safety.physical.emergencyProtocol || "stop",
        operating_zone: data.safety.physical.operatingZone || "indoor",
        max_speed: data.safety.physical.maxSpeed
      } : void 0
    } : void 0;
    const sensors = [];
    for (const [name, sensorData] of Object.entries(data.sensors || {})) {
      sensors.push({
        name,
        type: typeof sensorData === "object" ? sensorData.type : void 0,
        range: typeof sensorData === "object" ? sensorData.range : void 0,
        fov: typeof sensorData === "object" ? sensorData.fov : void 0,
        resolution: typeof sensorData === "object" ? sensorData.resolution : void 0,
        fps: typeof sensorData === "object" ? sensorData.fps : void 0,
        channels: typeof sensorData === "object" ? sensorData.channels : void 0
      });
    }
    const actuators = [];
    for (const [name, actData] of Object.entries(data.actuators || {})) {
      actuators.push({
        name,
        type: actData.type,
        max_speed: actData.maxSpeed,
        payload: actData.payload,
        reach: actData.reach,
        force: actData.force,
        dof: actData.dof,
        resolution: actData.resolution
      });
    }
    return {
      spec_version: data.specVersion || "0.5",
      name: data.name || "unknown",
      display_name: data.displayName || "Unknown",
      version: data.version || "1.0.0",
      description: data.description || "",
      author,
      license: data.license || "MIT",
      tags: data.tags || [],
      category: data.category || "general",
      compatibility,
      allowed_tools: data.allowedTools || [],
      recommended_skills: recommendedSkills,
      files,
      examples,
      disclosure,
      deprecated: data.deprecated || false,
      superseded_by: data.supersededBy,
      repository: data.repository,
      environment: Environment[data.environment] || "virtual" /* VIRTUAL */,
      interaction_mode: InteractionMode[data.interactionMode] || "text" /* TEXT */,
      hardware_constraints: hardwareConstraints,
      safety,
      sensors,
      actuators
    };
  }
  async loadLevel2(manifest, soulDir) {
    const soulPath = path.join(soulDir, manifest.files.soul);
    if (__require("fs").existsSync(soulPath)) {
      manifest.soul_content = __require("fs").readFileSync(soulPath, "utf-8");
    }
    if (manifest.files.identity) {
      const identityPath = path.join(soulDir, manifest.files.identity);
      if (__require("fs").existsSync(identityPath)) {
        manifest.identity_content = __require("fs").readFileSync(identityPath, "utf-8");
      }
    }
  }
  async loadLevel3(manifest, soulDir) {
    if (manifest.files.agents) {
      const agentsPath = path.join(soulDir, manifest.files.agents);
      if (__require("fs").existsSync(agentsPath)) {
        manifest.agents_content = __require("fs").readFileSync(agentsPath, "utf-8");
      }
    }
    if (manifest.files.style) {
      const stylePath = path.join(soulDir, manifest.files.style);
      if (__require("fs").existsSync(stylePath)) {
        manifest.style_content = __require("fs").readFileSync(stylePath, "utf-8");
      }
    }
    if (manifest.files.heartbeat) {
      const heartbeatPath = path.join(soulDir, manifest.files.heartbeat);
      if (__require("fs").existsSync(heartbeatPath)) {
        manifest.heartbeat_content = __require("fs").readFileSync(heartbeatPath, "utf-8");
      }
    }
    if (manifest.files.user_template) {
      const templatePath = path.join(soulDir, manifest.files.user_template);
      if (__require("fs").existsSync(templatePath)) {
        manifest.user_template_content = __require("fs").readFileSync(templatePath, "utf-8");
      }
    }
    if (manifest.examples) {
      if (manifest.examples.good) {
        const goodPath = path.join(soulDir, manifest.examples.good);
        if (__require("fs").existsSync(goodPath)) {
          manifest.examples_good_content = __require("fs").readFileSync(goodPath, "utf-8");
        }
      }
      if (manifest.examples.bad) {
        const badPath = path.join(soulDir, manifest.examples.bad);
        if (__require("fs").existsSync(badPath)) {
          manifest.examples_bad_content = __require("fs").readFileSync(badPath, "utf-8");
        }
      }
    }
    if (manifest.files.avatar) {
      const avatarPath = path.join(soulDir, manifest.files.avatar);
      if (__require("fs").existsSync(avatarPath)) {
        manifest.avatar_path = avatarPath;
      }
    }
  }
  buildSystemPrompt(manifest, level = 2, includeIdentity = true) {
    const parts = [];
    parts.push(`# ${manifest.display_name}`);
    parts.push(`
${manifest.description}`);
    if (manifest.disclosure?.summary) {
      parts.push(`
${manifest.disclosure.summary}`);
    }
    if (level >= 2) {
      if (manifest.soul_content) {
        parts.push(`

## Persona

${manifest.soul_content}`);
      }
      if (includeIdentity && manifest.identity_content) {
        parts.push(`

## Identity

${manifest.identity_content}`);
      }
    }
    if (level >= 3) {
      if (manifest.style_content) {
        parts.push(`

## Style Guidelines

${manifest.style_content}`);
      }
      if (manifest.agents_content) {
        parts.push(`

## Agent Behavior

${manifest.agents_content}`);
      }
      if (manifest.heartbeat_content) {
        parts.push(`

## Heartbeat

${manifest.heartbeat_content}`);
      }
      if (manifest.user_template_content) {
        parts.push(`

## User Message Template

${manifest.user_template_content}`);
      }
      if (manifest.examples_good_content || manifest.examples_bad_content) {
        parts.push("\n\n## Calibration Examples");
        if (manifest.examples_good_content) {
          parts.push(`

### Good Outputs

${manifest.examples_good_content}`);
        }
        if (manifest.examples_bad_content) {
          parts.push(`

### Outputs to Avoid

${manifest.examples_bad_content}`);
        }
      }
    }
    if (manifest.environment !== "virtual" /* VIRTUAL */) {
      parts.push(`

## Environment`);
      parts.push(`
You are an **${manifest.environment}** agent.`);
      if (manifest.interaction_mode !== "text" /* TEXT */) {
        parts.push(`
Primary interaction mode: ${manifest.interaction_mode}`);
      }
      if (manifest.hardware_constraints) {
        const hc = manifest.hardware_constraints;
        const capabilities = [];
        if (hc.has_display) capabilities.push("display");
        if (hc.has_speaker) capabilities.push("speaker");
        if (hc.has_microphone) capabilities.push("microphone");
        if (hc.has_camera) capabilities.push("camera");
        if (capabilities.length > 0) {
          parts.push(`
Hardware: ${capabilities.join(", ")}`);
        }
      }
      if (manifest.safety?.physical) {
        const ps = manifest.safety.physical;
        parts.push(`
Safety: ${ps.contact_policy} contact policy`);
      }
    }
    return parts.join("");
  }
  getAllSouls() {
    const souls = [];
    const seenSouls = /* @__PURE__ */ new Set();
    for (const soulsDir of this.soulsDirs) {
      const resolvedDir = path.resolve(soulsDir);
      try {
        if (__require("fs").existsSync(resolvedDir)) {
          const entries = __require("fs").readdirSync(resolvedDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !seenSouls.has(entry.name)) {
              const soulJsonPath = path.join(resolvedDir, entry.name, "soul.json");
              if (__require("fs").existsSync(soulJsonPath)) {
                souls.push(entry.name);
                seenSouls.add(entry.name);
              }
            }
          }
        }
      } catch (error) {
        debugLog("soul", `Error reading souls directory ${resolvedDir}: ${error}`);
      }
    }
    return souls;
  }
};
var branding = [
  `  \u26A1 Pi SoulSpec Extension v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`
].join("\n");
function soul_temp_default(pi) {
  debugLog("soul", "SoulSpec extension loading...");
  const soulLoader = new SoulSpecLoader();
  pi.registerTool({
    name: "load_soul",
    label: "Load Soul",
    description: "Load a SoulSpec persona and build system prompt",
    parameters: typebox_exports.Object({
      soul_name: typebox_exports.String({
        description: "Name of the soul to load (directory name or path)"
      }),
      level: typebox_exports.Optional(typebox_exports.Number({
        description: "Progressive disclosure level (1-3, default 2)",
        default: 2
      }))
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      debugLog("soul", `Loading soul: ${params.soul_name}, level: ${params.level || 2}`);
      try {
        const soul = await soulLoader.load(params.soul_name, params.level || 2);
        const systemPrompt = soulLoader.buildSystemPrompt(soul, params.level || 2);
        return {
          content: [{
            type: "text",
            text: `Soul "${soul.display_name}" loaded successfully.

System Prompt:
${systemPrompt}`
          }],
          details: {
            soul: soul.name,
            prompt: systemPrompt,
            level: params.level || 2
          }
        };
      } catch (error) {
        debugLog("soul", `Error loading soul: ${error}`);
        return {
          content: [{ type: "text", text: `Error loading soul: ${error}` }],
          isError: true
        };
      }
    }
  });
  pi.registerTool({
    name: "list_souls",
    label: "List Souls",
    description: "List all available SoulSpec personas",
    parameters: typebox_exports.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const souls = soulLoader.getAllSouls();
      if (souls.length === 0) {
        return {
          content: [{ type: "text", text: "No souls found. Create a souls/ directory with soul.json files." }]
        };
      }
      let response = "Available souls:\n\n";
      for (const soul of souls) {
        try {
          const manifest = await soulLoader.load(soul, 1);
          response += `- **${manifest.display_name}** (${soul})
`;
          response += `  ${manifest.description}
`;
          if (manifest.disclosure?.summary) {
            response += `  ${manifest.disclosure.summary}
`;
          }
          response += `
`;
        } catch (error) {
          response += `- **${soul}** (Error loading: ${error})

`;
        }
      }
      return {
        content: [{ type: "text", text: response }],
        details: { souls }
      };
    }
  });
  pi.registerTool({
    name: "soul_info",
    label: "Soul Info",
    description: "Get detailed information about a soul",
    parameters: typebox_exports.Object({
      soul_name: typebox_exports.String({
        description: "Name of the soul to get info for"
      })
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      debugLog("soul", `Getting soul info for: ${params.soul_name}`);
      try {
        const soul = await soulLoader.load(params.soul_name, 1);
        let info = `# ${soul.display_name}

`;
        info += `**Name:** ${soul.name}
`;
        info += `**Version:** ${soul.version}
`;
        info += `**Description:** ${soul.description}
`;
        info += `**Author:** ${soul.author.name}
`;
        info += `**License:** ${soul.license}
`;
        info += `**Environment:** ${soul.environment}
`;
        info += `**Category:** ${soul.category}
`;
        info += `**Tags:** ${soul.tags.join(", ")}
`;
        if (soul.disclosure?.summary) {
          info += `**Summary:** ${soul.disclosure.summary}
`;
        }
        if (soul.recommended_skills.length > 0) {
          info += `
**Recommended Skills:**
`;
          for (const skill of soul.recommended_skills) {
            info += `- ${skill.name}${skill.required ? " (required)" : ""}
`;
          }
        }
        if (soul.hardware_constraints) {
          info += `
**Hardware Constraints:**
`;
          const hc = soul.hardware_constraints;
          info += `- Display: ${hc.has_display ? "Yes" : "No"}
`;
          info += `- Speaker: ${hc.has_speaker ? "Yes" : "No"}
`;
          info += `- Microphone: ${hc.has_microphone ? "Yes" : "No"}
`;
          info += `- Camera: ${hc.has_camera ? "Yes" : "No"}
`;
          info += `- Mobility: ${hc.mobility}
`;
          info += `- Manipulator: ${hc.manipulator ? "Yes" : "No"}
`;
        }
        return {
          content: [{ type: "text", text: info }],
          details: { soul }
        };
      } catch (error) {
        debugLog("soul", `Error loading soul info: ${error}`);
        return {
          content: [{ type: "text", text: `Error loading soul info: ${error}` }],
          isError: true
        };
      }
    }
  });
  pi.on("session_start", async (event, ctx) => {
    debugLog("soul", "SoulSpec extension session started");
    ctx.ui.notify("SoulSpec extension loaded", "info");
  });
  pi.on("resources_discover", async (event, ctx) => {
    debugLog("soul", "SoulSpec extension discovering resources");
    return {
      skillPaths: [],
      // Souls are not skills
      promptPaths: [".pi/souls", "./souls", "~/.pi/agent/souls"],
      // Add souls directories to prompt discovery
      themePaths: []
    };
  });
  pi.registerCommand("souls", {
    description: "List available souls",
    handler: async (args, ctx) => {
      debugLog("soul", "Listing souls command");
      const souls = soulLoader.getAllSouls();
      if (souls.length === 0) {
        ctx.ui.notify("No souls found. Create a souls/ directory with soul.json files.", "info");
        return;
      }
      let message = "Available souls:\n\n";
      for (const soul of souls) {
        try {
          const manifest = await soulLoader.load(soul, 1);
          message += `\u2022 **${manifest.display_name}** (${soul})
`;
          message += `  ${manifest.description}
`;
          if (manifest.disclosure?.summary) {
            message += `  ${manifest.disclosure.summary}
`;
          }
          message += "\n";
        } catch (error) {
          message += `\u2022 **${soul}** (Error: ${error})

`;
        }
      }
      ctx.ui.notify(message, "info");
    }
  });
  pi.registerCommand("soul", {
    description: "Use a soul for the current session",
    handler: async (args, ctx) => {
      debugLog("soul", `Using soul command with: ${args}`);
      if (!args) {
        ctx.ui.notify("Usage: /soul <soul-name>", "error");
        return;
      }
      try {
        const soul = await soulLoader.load(args, 2);
        const systemPrompt = soulLoader.buildSystemPrompt(soul, 2);
        pi.sendMessage({
          customType: "soulspec",
          content: systemPrompt,
          display: true,
          details: { soul: soul.name, level: 2 }
        }, {
          deliverAs: "steer"
        });
        ctx.ui.notify(`Using soul: ${soul.display_name}`, "success");
      } catch (error) {
        debugLog("soul", `Error using soul: ${error}`);
        ctx.ui.notify(`Error loading soul: ${error}`, "error");
      }
    }
  });
  debugLog("soul", "SoulSpec extension loaded successfully");
}
export {
  ContactPolicy,
  Environment,
  InteractionMode,
  Mobility,
  SoulSpecLoader,
  soul_temp_default as default
};
