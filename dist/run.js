"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const haxball_js_1 = __importDefault(require("haxball.js"));
const index_1 = __importDefault(require("./index"));
const config_1 = __importDefault(require("./config"));
haxball_js_1.default.then((HBInit) => (0, index_1.default)(HBInit, Object.assign(Object.assign({}, config_1.default), { noPlayer: true }))); // noPlayer is required for team chooser to work correctly
