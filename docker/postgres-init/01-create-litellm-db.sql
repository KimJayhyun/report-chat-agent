-- postgres 컨테이너가 처음 초기화될 때만 실행됨(볼륨이 비어있을 때 1회).
-- litellm은 Prisma로 스키마를 통째로 관리해서, agent 체크포인터랑 같은 DB를
-- 쓰면 마이그레이션 때 agent 테이블까지 지워버릴 수 있음 — 그래서 DB를 분리한다.
CREATE DATABASE litellm;
