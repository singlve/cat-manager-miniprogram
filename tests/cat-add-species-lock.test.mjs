import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('筛选空状态添加宠物', () => {
  it('传递并锁定当前筛选的物种', () => {
    const listJs = read('pages/cat-list/cat-list.js');
    const listWxml = read('pages/cat-list/cat-list.wxml');

    expect(listWxml).toMatch(/bindtap="addFilteredPet"/);
    expect(listWxml).toMatch(/data-species="\{\{filterSpecies\}\}"/);
    expect(listJs).toMatch(/lockSpecies=1/);
    expect(listJs).toMatch(/dataset\.species === 'dog' \? 'dog' : 'cat'/);
  });

  it('添加页选中指定物种并禁用另一项', () => {
    const addJs = read('pet-package/cat-add/cat-add.js');
    const behaviorJs = read('pet-package/utils/cat-form-behavior.js');
    const formWxml = read('pet-package/templates/cat-form.wxml');

    expect(addJs).toMatch(/options\.species === "cat" \|\| options\.species === "dog"/);
    expect(addJs).toMatch(/speciesLocked: String\(options\.lockSpecies/);
    expect(behaviorJs).toMatch(/speciesLocked: false/);
    expect(formWxml).toMatch(/disabled="\{\{speciesLocked && species !== 'cat'\}\}"/);
    expect(formWxml).toMatch(/disabled="\{\{speciesLocked && species !== 'dog'\}\}"/);
  });

  it('普通添加宠物入口保持可自由选择', () => {
    const listJs = read('pages/cat-list/cat-list.js');
    expect(listJs).toMatch(/url: '\/pet-package\/cat-add\/cat-add'/);
  });
});
