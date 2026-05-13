function Light(color, distance, pos)
{
    this.color    = color;
    this.distance = distance;
    this.position = pos;
}

Light.prototype.changePos = function(pos)
{
    this.position = pos;
}

Light.prototype.getColorFor = function(pt, normal)
{
    var dp = new Array();
    dp[0] = this.position[0] - pt[0];
    dp[1] = this.position[1] - pt[1];
    dp[2] = this.position[2] - pt[2];

    var dn = Math.sqrt(dp[0]*dp[0] + dp[1]*dp[1] + dp[2]*dp[2]);

    var f = ((normal[0]*dp[0] + normal[1]*dp[1] + normal[2]*dp[2]));
    if (f<0.) f=0.;
    else if (dn) f/=dn;

    if (this.distance)
    {
        var d = (1.-dn/this.distance);
        if (d<0.) f=0.;
        else      f = f*Math.sqrt(d);
    }

    return [this.color[0]*f, this.color[1]*f, this.color[2]*f];
}
