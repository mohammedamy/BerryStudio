// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readSession, writeSession } from './session'
const source = {designId:'dress', pieces:[{id:'a',outline:[[0,0],[10,0],[10,10]]}]}
afterEach(()=>vi.restoreAllMocks())
describe('design-scoped setup persistence',()=>{
  it('restores only the same design and geometry',()=>{
    const map=new Map()
    Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}})
    expect(writeSession(source,{answers:{a:{copies:'single'}},editor:{seams:[]}})).toBe(true)
    expect(readSession(source).answers.a.copies).toBe('single')
    expect(readSession({...source,designId:'trousers'})).toBeNull()
    expect(readSession({...source,pieces:[{...source.pieces[0],outline:[[0,0],[20,0],[20,10]]}]})).toBeNull()
  })
  it('reports storage failure without crashing',()=>{
    Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(){throw new Error('blocked')},setItem(){throw new Error('quota')}}})
    expect(readSession(source)).toBeNull();expect(writeSession(source,{})).toBe(false)
  })
})
