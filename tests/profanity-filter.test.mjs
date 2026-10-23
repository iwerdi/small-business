import test from "node:test";
import assert from "node:assert/strict";
import { containsProfanity } from "../src/data/profanityFilter.js";

test("blocks common profanity and inflections", () => {
  for (const text of ["Блядь", "что за хуйня", "Заебался ждать", "пиздец", "ебаный"]){
    assert.equal(containsProfanity(text), true, `should block: ${text}`);
  }
});

test("blocks punctuation, spaces, and common lookalike substitutions", () => {
  for (const text of ["б л я д ь", "бл*ядь", "xуй", "бл@дь", "бл.я.дь", "бл9дь", "пи3да"]){
    assert.equal(containsProfanity(text), true, `should block obfuscated text: ${text}`);
  }
});

test("does not block ordinary contact messages or common neutral words", () => {
  for (const text of [
    "Здравствуйте, хочу записаться на ремонт автомобиля.",
    "Классный мастер, быстро сделал заказ.",
    "Не присылайте спам, пожалуйста.",
    "У меня есть член команды для проекта.",
  ]) {
    assert.equal(containsProfanity(text), false, `should allow: ${text}`);
  }
});
