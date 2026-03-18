export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (request.method === 'GET') {
      return new Response(htmlPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/api/parse')) {
      try {
        const body = await request.json();
        const shareUrl = (body.shareUrl || body.url || '').trim();
        const pwd = (body.pwd || '').trim();
        const fid = (body.fid || '0').trim(); // 文件夹ID，用于进入子目录

        if (!shareUrl || !/pan\.quark\.cn\/s\/([a-zA-Z0-9]+)/.test(shareUrl)) {
          return Response.json({ code: 1, msg: '请输入有效夸克分享链接' }, { headers: corsHeaders() });
        }

        const shareKey = shareUrl.match(/pan\.quark\.cn\/s\/([a-zA-Z0-9]+)/)[1];
        const cookie = env.QUARK_COOKIE;
        if (!cookie) return Response.json({ code: 1, msg: '未配置 QUARK_COOKIE' }, { headers: corsHeaders() });

        const list = await parseQuarkFolder(shareKey, pwd, fid, cookie);

        return Response.json({
          code: 0,
          data: { shareKey, pwd, list },
          msg: '解析成功'
        }, { headers: corsHeaders() });

      } catch (e) {
        return Response.json({ code: 1, msg: e.message || '解析失败' }, { headers: corsHeaders() });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};

// ======================
// 夸克文件夹 + 文件解析（QAIU 原版逻辑）
// ======================
async function parseQuarkFolder(shareKey, pwd, fid, cookie) {
  const api = 'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail';
  const params = new URLSearchParams({
    pwd_id: shareKey,
    stoken: pwd,
    pdir_fid: fid,
    _page: '1',
    _size: 100
  });

  const resp = await fetch(`${api}?${params}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://pan.quark.cn/',
      'Cookie': cookie
    }
  });

  const data = await resp.json();
  if (data.code !== 0) throw new Error(data.msg || '请求失败');

  const list = data.data?.list || [];
  return list.map(item => ({
    fid: item.fid,
    fileName: item.file_name,
    size: item.size,
    isDir: item.dir === 1,
    downloadUrl: item.download_url || null,
    path: item.path
  }));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

// ======================
// 前端页面（支持文件夹展示）
// ======================
function htmlPage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>夸克解析 - 文件夹版</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:20px;background:#f4f6f8;font-family:system-ui}
.main{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.06);padding:24px}
h3{text-align:center;margin-top:0}
input{width:100%;padding:12px;margin-bottom:10px;border:1px solid #ddd;border-radius:8px}
button{padding:12px;background:#0071e3;color:#fff;border:none;border-radius:8px;width:100%}
.item{padding:10px;border-bottom:1px solid #eee;display:flex;justify-content:space-between}
.dir{color:#0066cc;font-weight:500;cursor:pointer}
.url{color:#333;word-break:break-all;font-size:14px}
.err{color:#ff3333}
</style>
</head>
<body>
<div class="main">
  <h3>夸克网盘解析（支持文件夹）</h3>
  <input type="text" id="url" placeholder="夸克分享链接">
  <input type="text" id="pwd" placeholder="密码（无则空）">
  <button onclick="parse()">解析</button>
  <div id="result" style="margin-top:20px"></div>
</div>

<script>
let currentShareUrl = '';
let currentPwd = '';

async function parse(fid = '0') {
  const url = document.getElementById('url').value.trim();
  const pwd = document.getElementById('pwd').value.trim();
  if (!url) return alert('输入链接');
  currentShareUrl = url;
  currentPwd = pwd;

  const res = document.getElementById('result');
  res.innerHTML = '加载中...';

  try {
    const r = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareUrl: url, pwd, fid })
    });
    const json = await r.json();
    if (json.code !== 0) { res.innerHTML = '<div class="err">' + json.msg + '</div>'; return; }
    renderList(json.data.list);
  } catch (e) {
    res.innerHTML = '<div class="err">请求失败</div>';
  }
}

function renderList(list) {
  const res = document.getElementById('result');
  let html = '';
  list.forEach(item => {
    if (item.isDir) {
      html += '<div class="item"><span class="dir" onclick="parse(\'' + item.fid + '\')">📁 ' + item.fileName + '</span><span>文件夹</span></div>';
    } else {
      html += '<div class="item"><span>📄 ' + item.fileName + '</span><span class="url">' + item.downloadUrl + '</span></div>';
    }
  });
  res.innerHTML = html;
}
</script>
</body>
</html>
  `;
}
