# 베르셀 배포 — 폰에서 5분

이 저장소가 그대로 사이트입니다. 빌드 과정도, 하위 폴더 설정도 없습니다.

---

## ⚠ 순서를 꼭 지키세요

**Supabase를 먼저 붙이고 나서 링크를 퍼뜨리세요.**

Supabase 없이 배포하면 응답이 **각자의 브라우저에만** 저장됩니다.
링크를 먼저 돌리면 그 사람들의 기록은 어디에도 안 남고, 나중에 복구할 방법이 없습니다.
초기 응답자 수백 명이 통째로 사라집니다.

올바른 순서: **① Supabase → ② 코드 3줄 수정 → ③ 배포 → ④ 공유**

---

## ① Supabase (5분)

### 1-1. 프로젝트 만들기

**New project** 를 누르면 입력칸이 나옵니다.

| 칸 | 넣을 값 |
|---|---|
| Organization | 그대로 둡니다 |
| Project name | `yangsim` |
| Database Password | **Generate a password** 눌러서 자동 생성 |
| Region | **Northeast Asia (Seoul)** |
| Plan | Free |

> **Region은 꼭 Seoul로.** 기본값이 미국이면 한국에서 접속할 때마다
> 태평양을 왕복합니다. 결과 화면 뜨는 속도가 눈에 띄게 달라집니다.

> **Database Password는 안 쓰실 겁니다.** 이 사이트는 비밀번호가 아니라
> 아래에서 복사할 공개 키로 접속합니다. 그래도 Supabase가 요구하니
> 자동 생성해서 넣고 넘어가세요.

**Create new project** 누르면 1~2분 걸립니다. 커피 한 잔.

### 1-2. 표와 함수 만들기

왼쪽 메뉴 **SQL Editor** → **New query**.

> ⚠ **반드시 네 번에 나눠서 돌리세요.** 한꺼번에 붙여넣으면
> 편집기가 구문을 쪼개 보내는 순서가 꼬여, 표가 만들어지기 전에
> 함수가 실행되면서 실패합니다. 실제로 그렇게 걸렸습니다.
>
> 그리고 **"No limit"** 으로 두고 실행하세요. `limit 100` 이 자동으로
> 붙으면 `create` 문에서 문법 오류가 납니다.
>
> **프로젝트를 확인하세요.** 왼쪽 위에 지금 어느 프로젝트인지 나옵니다.
> 여러 개를 쓰고 있다면 중간에 바뀌어 있을 수 있습니다.

#### 【1】 표와 보안 정책

```sql
create table if not exists public.conscience_logs (
  id   bigint generated always as identity primary key,
  path text not null,
  hcq  int,
  type text,
  at   timestamptz default now()
);

alter table public.conscience_logs enable row level security;

drop policy if exists "anyone can insert" on public.conscience_logs;
drop policy if exists "anyone can read"   on public.conscience_logs;

create policy "anyone can insert"
  on public.conscience_logs for insert to anon with check (true);

create policy "anyone can read"
  on public.conscience_logs for select to anon using (true);

create index if not exists conscience_logs_path_idx
  on public.conscience_logs (path);
```

#### 【2】 표가 생겼는지 확인 — 꼭 하세요

```sql
select count(*) as 표있음 from information_schema.tables
where table_schema='public' and table_name='conscience_logs';
```

**`1` 이 나와야 다음으로 갑니다.** `0` 이면 【1】이 실패한 것입니다.

#### 【3】 집계 함수

```sql
create or replace function public.conscience_stats(mine text default null)
returns json
language sql
stable
as $$
  select json_build_object(
    'n',  (select count(*) from public.conscience_logs),
    'q0', (select json_object_agg(k,c) from (select substr(path,1,2)  k, count(*) c from public.conscience_logs group by 1) t),
    'q1', (select json_object_agg(k,c) from (select substr(path,4,2)  k, count(*) c from public.conscience_logs group by 1) t),
    'q2', (select json_object_agg(k,c) from (select substr(path,7,2)  k, count(*) c from public.conscience_logs group by 1) t),
    'q3', (select json_object_agg(k,c) from (select substr(path,10,2) k, count(*) c from public.conscience_logs group by 1) t),
    'q4', (select json_object_agg(k,c) from (select substr(path,13,2) k, count(*) c from public.conscience_logs group by 1) t),
    'twin', (select count(*) from public.conscience_logs
               where mine is not null and path = mine),
    'same', (select count(*) from public.conscience_logs
               where mine is not null
                 and substr(path,1,1)  = substr(mine,1,1)
                 and substr(path,4,1)  = substr(mine,4,1)
                 and substr(path,7,1)  = substr(mine,7,1)
                 and substr(path,10,1) = substr(mine,10,1)
                 and substr(path,13,1) = substr(mine,13,1))
  )
$$;
```

> 함수 본문 안에는 세미콜론을 두지 않았습니다. 편집기가 `$$` 안의 `;` 를
> 구문 끝으로 잘못 보고 쪼개는 경우가 있습니다.

#### 【4】 권한 부여와 확인

```sql
grant usage on schema public to anon;
grant select, insert on table public.conscience_logs to anon;
grant execute on function public.conscience_stats(text) to anon;

notify pgrst, 'reload schema';

select has_table_privilege('anon','public.conscience_logs','INSERT') as 넣기,
       has_table_privilege('anon','public.conscience_logs','SELECT') as 읽기,
       public.conscience_stats() as 집계;
```

**넣기·읽기가 둘 다 `true`** 여야 합니다.

> ⚠ **이 단계를 빼먹으면 조용히 실패합니다.** 실제로 여기서 걸렸습니다.
>
> RLS 정책(【1】의 `create policy`)은 *"누가 어떤 행을 다룰 수 있나"* 를 정합니다.
> 그런데 그 **이전 단계**인 *"이 역할이 이 테이블을 건드릴 수 있나"* 는
> 별개의 권한(GRANT)입니다. 정책만 만들고 권한을 안 주면
> `401 permission denied for table` 로 거절당합니다.
>
> 증상이 헷갈립니다. SQL Editor 는 `postgres` 역할로 돌아가니 전부 잘 되는데,
> 사이트에서 들어오는 요청만 `anon` 역할이라 막힙니다. 대시보드에서는
> 멀쩡해 보이고 기록만 안 쌓입니다.

집계 칸에 `{"n": 0, "q0": null, ..., "twin": 0, "same": 0}` 이 나오면 완료입니다.
기록이 아직 0건이라 `q0`가 `null`인 것은 정상입니다.

**무엇을 한 건지:**
- 기록을 담을 표를 만들고
- 보안(RLS)을 켠 다음 **넣기(insert)** 와 **읽기(select)** 만 열었습니다.
  수정과 삭제는 아무에게도 열지 않았으므로 남의 기록을 건드릴 수 없습니다.
- **집계 함수**를 만들었습니다. 방문자는 전체 기록이 아니라
  이 함수가 계산해 준 요약만 받습니다.

> **집계 함수가 중요한 이유.** 이게 없으면 방문자 한 명이 들어올 때마다
> 누적 기록 **전부**를 내려받습니다. 기록이 10만 건이면 한 명당 2MB쯤 되고,
> 무료 전송량 5GB가 **2만 명쯤에서 바닥납니다.**
> 함수가 있으면 기록이 100만 건이어도 한 명당 1KB 미만입니다.
> 사이트는 함수가 없어도 동작하지만, 그때는 위 한계를 그대로 맞습니다.

### 1-3. 키 두 개 복사

왼쪽 메뉴 맨 아래 **Settings**(톱니바퀴) → **API**

두 가지를 복사해 둡니다.

1. **Project URL** — `https://xxxxxxxx.supabase.co`
2. **공개 키** — 화면에 따라 이름이 다릅니다
   - `anon` `public` 이라고 쓰인 긴 `eyJ...` 문자열, 또는
   - **Publishable key** 라고 쓰인 `sb_publishable_...` 문자열

   **둘 중 보이는 것을 쓰면 됩니다.** 둘 다 보이면 아무거나 상관없습니다.

> ⚠ **`service_role` 또는 `secret` 이라고 쓰인 키는 절대 쓰지 마세요.**
> 그 키는 보안을 전부 통과합니다. 사이트에 넣으면 누구나 전체 데이터를
> 지울 수 있게 됩니다. 반드시 **anon / public / publishable** 쪽입니다.

> 공개 키는 **코드에 그대로 박아도 되는 키**입니다. 위에서 켠 RLS가
> 넣기·읽기만 허용하기 때문에, 가져가도 할 수 있는 게 그 둘뿐입니다.

## ② 코드 3줄 수정

깃허브에서 `yangsim/index.html` 을 열고 **연필 아이콘**을 누릅니다.
(폰에서도 됩니다)

브라우저 찾기로 `const SUPABASE` 를 찾으면 파일 위쪽에 이렇게 생긴 곳이 있습니다.

```js
const SUPABASE = {
  url:   '',
  key:   '',
  table: 'conscience_logs'
};
```

따옴표 **안쪽**에 1-3에서 복사한 것을 넣습니다.

```js
const SUPABASE = {
  url:   'https://xxxxxxxx.supabase.co',
  key:   'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
  table: 'conscience_logs'
};
```

- 따옴표를 지우지 마세요
- 줄 끝 쉼표(`,`)를 지우지 마세요
- `table` 줄은 그대로 둡니다

**Commit changes** 를 누르면 저장됩니다.

> 주소 끝에 `/` 를 붙이지 마세요. `https://xxxx.supabase.co` 까지입니다.

---

## ③ 배포

1. vercel.com → **Add New → Project**
3. **Import Git Repository** 에서 `mio-modu/yangsim_Analyzer` 선택
4. **Project Name** 을 `yangsim` 으로 (이 이름이 주소가 됩니다)
5. **Root Directory 는 건드리지 마세요.** 저장소 최상위가 곧 사이트입니다
6. **Deploy**

끝나면 `https://yangsimanalyzer.vercel.app` 으로 열립니다.

> **Project Name을 `yangsim`으로 해야** 저장소에 들어 있는 OG 이미지 주소가
> 그대로 맞습니다. 다른 이름이 배정되면 `index.html` 상단 주석에 표시된
> 세 줄의 주소만 바꾸면 됩니다.

---

## ④ 확인 (공유 전에)

- [ ] 사이트가 열리고 질문이 나온다
- [ ] 다섯 문항을 끝까지 풀면 결과가 나온다
- [ ] Supabase → **Table Editor → conscience_logs** 에 **행이 1개 생겼다** ← 가장 중요
      (`path` 칸에 `01-10-02-21-13` 같은 값이 들어 있어야 합니다)
- [ ] 다른 기기(또는 시크릿창)에서 열었을 때 상단 숫자가 올라가 있다
- [ ] 카카오톡 나에게 링크 보내기 → 미리보기 이미지가 뜬다

**3번이 안 되면 공유하지 마세요.** 데이터가 안 쌓이고 있다는 뜻입니다.

---

## 나중에 도메인 옮길 때

1. 도메인 구입
2. Vercel → 프로젝트 → **Settings → Domains → Add**
3. `index.html`, `robots.txt`, `sitemap.xml` 안의
   `yangsimanalyzer.vercel.app` 을 새 도메인으로 바꾸기 (저한테 말씀하시면 됩니다)

`yangsimanalyzer.vercel.app` 주소는 계속 살아 있으니 **이미 퍼진 링크도 안 깨집니다.**
데이터는 Supabase에 있어서 도메인과 무관하게 그대로 이어집니다.

---

## 저장소 안에 있는 것

| 파일 | 역할 |
|---|---|
| `index.html` | 사이트 전부. 배경 이미지까지 이 안에 들어 있습니다 |
| `og.jpg` | 카카오톡·트위터 링크 미리보기 이미지 (1200×630) |
| `llms.txt` | AI가 이 사이트를 읽을 때 보는 설명 |
| `robots.txt` / `sitemap.xml` | 검색엔진용 |
| `vercel.json` | 캐시·보안 헤더 |


---

## 나중에 알려주셔야 할 것

### 질문을 고치거나 늘리면

집계 함수의 `substr(path, N, 2)` 자리들이 질문 개수와 묶여 있습니다.
질문을 바꾸시면 **함수도 같이 바꿔야 합니다.** 저한테 말씀하시면 됩니다.
안 바꾸면 사이트는 조용히 두 번째 경로(전체 내려받기)로 떨어집니다.

### 무료 플랜 일시정지

무료 프로젝트는 **일주일 내내 아무 접속이 없으면** 잠듭니다.
사람이 들어오고 있으면 안 잠기고, 잠겨도 대시보드에서 한 번 깨우면
데이터는 그대로입니다. 다만 그 사이 방문자는 기록이 안 남으니,
초반에 조용한 시기가 길어지면 한 번씩 들어가 보세요.
