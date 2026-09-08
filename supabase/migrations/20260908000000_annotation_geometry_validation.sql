-- Fence annotation write RPCs: geometry type whitelist + area_id format.
-- Remote project already enforced ST_IsValid; this migration keeps the repo in sync
-- and adds explicit type / area_id guards.

CREATE OR REPLACE FUNCTION public.create_annotation(
  p_geometry jsonb,
  p_username text DEFAULT NULL,
  p_area_id text DEFAULT NULL,
  p_extra boolean DEFAULT false,
  p_sample boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_id uuid;
  v_geom geometry;
  v_username text;
  v_label text;
  v_props jsonb := '{}'::jsonb;
  v_gtype text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform private.enforce_rate_limit('annotation_write');
  perform private.enforce_rate_limit('annotation_create_daily');

  if p_geometry is null or jsonb_typeof(p_geometry) <> 'object' then
    raise exception 'geometry must be a GeoJSON object';
  end if;

  v_geom := st_setsrid(st_geomfromgeojson(p_geometry::text), 4326);
  v_gtype := st_geometrytype(v_geom);
  if v_gtype not in ('ST_Polygon', 'ST_LineString', 'ST_MultiPolygon', 'ST_MultiLineString') then
    raise exception 'geometry type not allowed: %', v_gtype;
  end if;
  if not st_isvalid(v_geom) or st_npoints(v_geom) > 100000 then
    raise exception 'invalid or oversized geometry';
  end if;

  v_username := lower(btrim(coalesce(p_username, '')));
  if v_username <> '' and v_username !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'username must be 3-32 lowercase letters, numbers, or underscores';
  end if;

  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    v_label := coalesce(nullif(v_username, ''), 'Guest');
  else
    select username into v_label from public.profiles where user_id = auth.uid();
    if v_label is null then raise exception 'create a profile before annotating'; end if;
  end if;

  if nullif(btrim(coalesce(p_area_id, '')), '') is not null
     and not coalesce(p_extra, false)
     and not coalesce(p_sample, false) then
    if btrim(p_area_id) !~ '^[0-9A-Za-z_-]{1,64}$' then
      raise exception 'invalid area_id';
    end if;
    v_props := v_props || jsonb_build_object('area_id', btrim(p_area_id));
  end if;
  if coalesce(p_extra, false) or coalesce(p_sample, false) then
    v_props := v_props || jsonb_build_object('extra', true, 'sample', coalesce(p_sample, false));
  end if;

  insert into public.annotations(created_by, author_label, geometry, properties)
  values (auth.uid(), v_label, v_geom, v_props)
  returning id into v_id;

  perform private.record_rate_limit_event('annotation_write');
  perform private.record_rate_limit_event('annotation_created');
  return v_id;
end;
$function$;

-- Two-arg overload delegates to the extended signature.
CREATE OR REPLACE FUNCTION public.create_annotation(
  p_geometry jsonb,
  p_username text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  return public.create_annotation(p_geometry, p_username, null, false, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.propose_annotation_edit(
  p_annotation_id uuid,
  p_geometry jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_id uuid;
  v_geom geometry;
  v_gtype text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform private.enforce_rate_limit('annotation_write');
  if not exists (
    select 1 from public.annotations where id = p_annotation_id and visibility = 'visible'
  ) then
    raise exception 'annotation not found';
  end if;
  if p_geometry is null or jsonb_typeof(p_geometry) <> 'object' then
    raise exception 'geometry must be a GeoJSON object';
  end if;

  v_geom := st_setsrid(st_geomfromgeojson(p_geometry::text), 4326);
  v_gtype := st_geometrytype(v_geom);
  if v_gtype not in ('ST_Polygon', 'ST_LineString', 'ST_MultiPolygon', 'ST_MultiLineString') then
    raise exception 'geometry type not allowed: %', v_gtype;
  end if;
  if not st_isvalid(v_geom) or st_npoints(v_geom) > 100000 then
    raise exception 'invalid or oversized geometry';
  end if;

  insert into public.annotation_revisions(annotation_id, proposed_by, geometry, properties)
  values (p_annotation_id, auth.uid(), v_geom, '{}'::jsonb)
  returning id into v_id;

  perform private.record_rate_limit_event('annotation_write');
  perform private.record_rate_limit_event('edit_proposed');
  return v_id;
end;
$function$;
