#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shobjidl.h>
#include <richedit.h>
#include <algorithm>
#include <atomic>
#include <cstring>
#include <new>
#include <string>
#include "render.h"

// {A448B833-8E1A-4EA4-BCC4-272134A64E97}
static const CLSID CLSID_MarkWriterPreview = {0xa448b833,0x8e1a,0x4ea4,{0xbc,0xc4,0x27,0x21,0x34,0xa6,0x4e,0x97}};
static std::atomic<long> objects{0};
static std::atomic<long> locks{0};
static HMODULE module;

struct RtfReader { const std::string* text; size_t offset; };
static DWORD CALLBACK read_rtf(DWORD_PTR cookie, LPBYTE buffer, LONG size, LONG* read) {
  auto& s = *reinterpret_cast<RtfReader*>(cookie);
  size_t n = (std::min)(static_cast<size_t>(size), s.text->size()-s.offset);
  memcpy(buffer,s.text->data()+s.offset,n); s.offset+=n; *read=static_cast<LONG>(n); return 0;
}
class Preview final : public IPreviewHandler, public IInitializeWithStream, public IObjectWithSite, public IOleWindow {
  std::atomic<ULONG> refs{1}; IStream* stream=nullptr; IUnknown* site=nullptr;
  HWND parent=nullptr, view=nullptr; HMODULE richEdit=nullptr; RECT rect{};
public:
  Preview() { ++objects; }
  ~Preview() { Unload(); if(site) site->Release(); --objects; }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** out) override {
    if(!out) return E_POINTER; *out=nullptr;
    if(id==IID_IUnknown || id==IID_IPreviewHandler) *out=static_cast<IPreviewHandler*>(this);
    else if(id==IID_IOleWindow) *out=static_cast<IOleWindow*>(this);
    else if(id==IID_IInitializeWithStream) *out=static_cast<IInitializeWithStream*>(this);
    else if(id==IID_IObjectWithSite) *out=static_cast<IObjectWithSite*>(this);
    else return E_NOINTERFACE;
    AddRef(); return S_OK;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++refs; }
  ULONG STDMETHODCALLTYPE Release() override { auto n=--refs; if(!n) delete this; return n; }
  HRESULT STDMETHODCALLTYPE Initialize(IStream* s, DWORD) override {
    if(!s) return E_INVALIDARG; if(stream) return HRESULT_FROM_WIN32(ERROR_ALREADY_INITIALIZED);
    stream=s; stream->AddRef(); return S_OK;
  }
  HRESULT STDMETHODCALLTYPE GetWindow(HWND* p) override { if(!p) return E_POINTER; *p=view ? view : parent; return *p ? S_OK : E_FAIL; }
  HRESULT STDMETHODCALLTYPE ContextSensitiveHelp(BOOL) override { return E_NOTIMPL; }
  HRESULT STDMETHODCALLTYPE SetWindow(HWND p, const RECT* r) override {
    if(!p || !r) return E_INVALIDARG; parent=p; rect=*r; return SetRect(r);
  }
  HRESULT STDMETHODCALLTYPE SetRect(const RECT* r) override {
    if(!r) return E_INVALIDARG; rect=*r;
    if(view) MoveWindow(view,r->left,r->top,r->right-r->left,r->bottom-r->top,TRUE);
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE DoPreview() override {
    try {
    if(!stream || !parent || view) return E_UNEXPECTED;
    constexpr size_t limit=1024*1024; std::string bytes; bytes.reserve(limit+1);
    char buffer[8192];
    while(bytes.size()<=limit) {
      ULONG got=0, want=static_cast<ULONG>((std::min)(sizeof buffer,limit+1-bytes.size()));
      HRESULT hr=stream->Read(buffer,want,&got); if(FAILED(hr)) return hr;
      bytes.append(buffer,got); if(!got || hr==S_FALSE) break;
    }
    bool truncated=bytes.size()>limit; if(truncated) bytes.resize(limit);
    std::string rtf=render_markdown(bytes,truncated);
    richEdit=LoadLibraryExW(L"Msftedit.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if(!richEdit) return HRESULT_FROM_WIN32(GetLastError());
    view=CreateWindowExW(0,MSFTEDIT_CLASS,L"",WS_CHILD|WS_VISIBLE|WS_VSCROLL|ES_MULTILINE|ES_READONLY|ES_AUTOVSCROLL,
      rect.left,rect.top,rect.right-rect.left,rect.bottom-rect.top,parent,nullptr,module,nullptr);
    if(!view) { auto hr=HRESULT_FROM_WIN32(GetLastError()); FreeLibrary(richEdit); richEdit=nullptr; return hr; }
    SendMessageW(view,EM_SETBKGNDCOLOR,0,RGB(255,255,255));
    SendMessageW(view,EM_EXLIMITTEXT,0,16 * 1024 * 1024);
    RtfReader reader{&rtf,0}; EDITSTREAM es{}; es.dwCookie=reinterpret_cast<DWORD_PTR>(&reader); es.pfnCallback=read_rtf;
    SendMessageW(view,EM_STREAMIN,SF_RTF,reinterpret_cast<LPARAM>(&es));
    if(es.dwError) { DestroyWindow(view); view=nullptr; FreeLibrary(richEdit); richEdit=nullptr; return E_FAIL; }
    return S_OK;
    } catch(const std::bad_alloc&) { return E_OUTOFMEMORY; } catch(...) { return E_FAIL; }
  }
  HRESULT STDMETHODCALLTYPE Unload() override { if(view) { DestroyWindow(view); view=nullptr; } if(richEdit) { FreeLibrary(richEdit); richEdit=nullptr; } if(stream) { stream->Release(); stream=nullptr; } return S_OK; }
  HRESULT STDMETHODCALLTYPE SetFocus() override { if(!view) return E_FAIL; ::SetFocus(view); return S_OK; }
  HRESULT STDMETHODCALLTYPE QueryFocus(HWND* p) override { if(!p) return E_POINTER; *p=::GetFocus(); return S_OK; }
  HRESULT STDMETHODCALLTYPE TranslateAccelerator(MSG* msg) override {
    if(!msg) return E_POINTER; IPreviewHandlerFrame* frame=nullptr;
    if(site && SUCCEEDED(site->QueryInterface(IID_PPV_ARGS(&frame)))) { HRESULT hr=frame->TranslateAccelerator(msg); frame->Release(); return hr; }
    return S_FALSE;
  }
  HRESULT STDMETHODCALLTYPE SetSite(IUnknown* s) override { if(s) s->AddRef(); if(site) site->Release(); site=s; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetSite(REFIID id, void** p) override { if(!p) return E_POINTER; *p=nullptr; return site ? site->QueryInterface(id,p) : E_FAIL; }
};
class Factory final : public IClassFactory {
  std::atomic<ULONG> refs{1};
public:
  Factory(){++objects;} ~Factory(){--objects;}
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id,void** p) override { if(!p)return E_POINTER; *p=nullptr; if(id!=IID_IUnknown && id!=IID_IClassFactory)return E_NOINTERFACE; *p=static_cast<IClassFactory*>(this); AddRef(); return S_OK; }
  ULONG STDMETHODCALLTYPE AddRef() override{return ++refs;}
  ULONG STDMETHODCALLTYPE Release() override{auto n=--refs;if(!n)delete this;return n;}
  HRESULT STDMETHODCALLTYPE CreateInstance(IUnknown* outer,REFIID id,void** p) override { if(!p)return E_POINTER; *p=nullptr; if(outer)return CLASS_E_NOAGGREGATION; auto obj=new(std::nothrow) Preview; if(!obj)return E_OUTOFMEMORY; auto hr=obj->QueryInterface(id,p); obj->Release(); return hr; }
  HRESULT STDMETHODCALLTYPE LockServer(BOOL lock) override { if(lock)++locks;else --locks;return S_OK; }
};
extern "C" BOOL WINAPI DllMain(HINSTANCE instance,DWORD reason,LPVOID) { if(reason==DLL_PROCESS_ATTACH){module=instance;DisableThreadLibraryCalls(instance);} return TRUE; }
STDAPI DllCanUnloadNow(){return objects==0 && locks==0 ? S_OK:S_FALSE;}
STDAPI DllGetClassObject(REFCLSID clsid,REFIID id,void** p){if(!p)return E_POINTER;*p=nullptr;if(clsid!=CLSID_MarkWriterPreview)return CLASS_E_CLASSNOTAVAILABLE;auto f=new(std::nothrow) Factory;if(!f)return E_OUTOFMEMORY;auto hr=f->QueryInterface(id,p);f->Release();return hr;}
