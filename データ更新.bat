@echo off
cd /d "%~dp0"
echo ============================================
echo  Converting shapefiles to GeoJSON...
echo  (source: TOSHIKEIKAKU-KUIKI folder)
echo ============================================
python scripts\convert_shp_to_geojson.py
echo.
echo Done. Check the messages above.
echo To publish: ask Claude "koukai shite" or run git commit/push.
pause
